import { NextRequest, NextResponse } from "next/server";
import { explainIssue, explainIssueStream } from "@/lib/aiClient";
import { enforceRateLimit, aiLimiter } from "@/lib/rateLimit";
import { sanitiseHtml } from "@/lib/sanitise";
import { AiExplainRequestSchema } from "@/lib/schemas";
import { validateRequest } from "@/lib/validate-request";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(req, aiLimiter);
    if (rateLimited) return rateLimited;

    const parsed = await validateRequest(req, AiExplainRequestSchema);
    if (!parsed.ok) return parsed.error;

    // Streaming opt-in via `?stream=1`. The interactive Explain tab uses this
    // to avoid the "Request timed out after 120s" failure that happens when
    // the underlying Anthropic call buffers the full 4096-token response
    // before returning. Background batches (`lib/explain-all.ts`) keep the
    // JSON path so the per-request error/text contract stays unchanged.
    const wantsStream = req.nextUrl.searchParams.get("stream") === "1";

    if (wantsStream) {
      const { stream, model } = await explainIssueStream(parsed.data.issue, req.signal);
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-AI-Model": model,
        },
      });
    }

    const { text, model } = await explainIssue(parsed.data.issue);
    return NextResponse.json({ explanation: sanitiseHtml(text), model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Explanation failed";
    const misconfigured =
      message.includes("ASSEMBLYAI_API_KEY") ||
      message.includes("ANTHROPIC_API_KEY") ||
      message.includes("GEMINI_API_KEY") ||
      message.includes("Configure ASSEMBLYAI_API_KEY");
    const status = misconfigured ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
