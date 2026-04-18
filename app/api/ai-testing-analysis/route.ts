import { NextRequest, NextResponse } from "next/server";
import type { ScanIssue } from "@/lib/axeScanner";
import { analyzeScanForTestingAgent } from "@/lib/aiClient";
import { sanitizeIssueForApi } from "@/lib/issueSanitize";
import type {
  ExpertAuditOutputFormat,
  ExpertAuditPriority,
  TestingAnalysisMode,
} from "@/lib/testingAnalysisPrompts";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MODES: TestingAnalysisMode[] = [
  "pour",
  "methods",
  "checkpoints",
  "comprehensive",
  "expert-audit",
];

const PRIORITIES: ExpertAuditPriority[] = ["aa", "aa-aaa"];
const OUTPUT_FORMATS: ExpertAuditOutputFormat[] = ["markdown", "json", "jira"];

function isScanIssue(value: unknown): value is ScanIssue {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.description === "string" &&
    typeof o.impact === "string" &&
    typeof o.html === "string" &&
    typeof o.helpUrl === "string" &&
    typeof o.index === "number"
  );
}

function isMode(value: unknown): value is TestingAnalysisMode {
  return typeof value === "string" && (MODES as string[]).includes(value);
}

function isPriority(value: unknown): value is ExpertAuditPriority {
  return typeof value === "string" && (PRIORITIES as string[]).includes(value);
}

function isOutputFormat(value: unknown): value is ExpertAuditOutputFormat {
  return typeof value === "string" && (OUTPUT_FORMATS as string[]).includes(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      scannedUrl?: unknown;
      issues?: unknown;
      mode?: unknown;
      priority?: unknown;
      outputFormat?: unknown;
    };

    if (typeof body.scannedUrl !== "string" || !body.scannedUrl.trim()) {
      return NextResponse.json({ error: "Invalid or missing scannedUrl." }, { status: 400 });
    }

    if (!isMode(body.mode)) {
      return NextResponse.json(
        { error: "Invalid mode. Use pour, methods, checkpoints, comprehensive, or expert-audit." },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.issues)) {
      return NextResponse.json({ error: "Invalid issues array." }, { status: 400 });
    }

    if (body.issues.length > 0 && !body.issues.every(isScanIssue)) {
      return NextResponse.json({ error: "Invalid issue object in issues array." }, { status: 400 });
    }

    let priority: ExpertAuditPriority = "aa";
    if (body.priority !== undefined) {
      if (!isPriority(body.priority)) {
        return NextResponse.json(
          { error: "Invalid priority. Use aa or aa-aaa." },
          { status: 400 },
        );
      }
      priority = body.priority;
    }

    let outputFormat: ExpertAuditOutputFormat = "markdown";
    if (body.outputFormat !== undefined) {
      if (!isOutputFormat(body.outputFormat)) {
        return NextResponse.json(
          { error: "Invalid outputFormat. Use markdown, json, or jira." },
          { status: 400 },
        );
      }
      outputFormat = body.outputFormat;
    }

    const issues = body.issues as ScanIssue[];
    const sanitized = issues.map(sanitizeIssueForApi);

    const { text, model } = await analyzeScanForTestingAgent(
      body.scannedUrl.trim(),
      sanitized,
      body.mode,
      { priority, outputFormat },
    );

    return NextResponse.json({ analysis: text, model, mode: body.mode, priority, outputFormat });
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
