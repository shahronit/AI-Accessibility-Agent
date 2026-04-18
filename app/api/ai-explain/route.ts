import { NextRequest, NextResponse } from "next/server";
import { explainIssue } from "@/lib/aiClient";
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
