import { NextRequest, NextResponse } from "next/server";
import type { ScanIssue } from "@/lib/axeScanner";
import {
  analyzeScanForTestingAgent,
  analyzeScanForTestingAgentStream,
} from "@/lib/aiClient";
import { sanitizeIssueForApi } from "@/lib/issueSanitize";
import { enforceRateLimit, aiLimiter } from "@/lib/rateLimit";
import { sanitiseHtml } from "@/lib/sanitise";
import { buildStreamingResponse } from "@/lib/stream-response";
import { TestingAnalysisRequestSchema } from "@/lib/schemas";
import { validateRequest } from "@/lib/validate-request";
import type {
  ExpertAuditOutputFormat,
  ExpertAuditPriority,
  TestingAnalysisMode,
} from "@/lib/testingAnalysisPrompts";

const STREAMING_MODES: ReadonlySet<TestingAnalysisMode> = new Set([
  "expert-audit",
  "comprehensive",
]);

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(req, aiLimiter);
    if (rateLimited) return rateLimited;

    const parsed = await validateRequest(req, TestingAnalysisRequestSchema);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const priority: ExpertAuditPriority = body.priority ?? "aa";
    const outputFormat: ExpertAuditOutputFormat = body.outputFormat ?? "markdown";
    const issues = body.issues as ScanIssue[];
    const sanitized = issues.map(sanitizeIssueForApi);
    const scannedUrl = body.scannedUrl.trim();
    const mode = body.mode;

    // Streaming opt-in via `?stream=1` — only honoured for the long-running
    // expert-audit / comprehensive modes. Other modes ignore the param so
    // existing callers (and the JSON-shape post-processors for testCases /
    // testing-scenarios) keep working unchanged.
    const wantsStream =
      req.nextUrl.searchParams.get("stream") === "1" && STREAMING_MODES.has(mode);

    if (wantsStream) {
      const { stream, model } = await analyzeScanForTestingAgentStream(
        scannedUrl,
        sanitized,
        mode,
        { priority, outputFormat },
        req.signal,
      );
      return buildStreamingResponse({ stream, model, mode, priority, outputFormat });
    }

    const { text, model } = await analyzeScanForTestingAgent(
      scannedUrl,
      sanitized,
      mode,
      { priority, outputFormat },
    );

    return NextResponse.json({
      analysis: sanitiseHtml(text),
      model,
      mode,
      priority,
      outputFormat,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Testing analysis failed";
    const misconfigured =
      message.includes("ASSEMBLYAI_API_KEY") ||
      message.includes("ANTHROPIC_API_KEY") ||
      message.includes("GEMINI_API_KEY") ||
      message.includes("Configure ASSEMBLYAI_API_KEY");
    const status = misconfigured ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
