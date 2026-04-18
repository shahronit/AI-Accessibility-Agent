import { NextRequest, NextResponse } from "next/server";
import { chatWithContext } from "@/lib/aiClient";
import { enforceRateLimit, chatLimiter } from "@/lib/rateLimit";
import { sanitiseHtml } from "@/lib/sanitise";
import { ChatRequestSchema } from "@/lib/schemas";
import { validateRequest } from "@/lib/validate-request";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(req, chatLimiter);
    if (rateLimited) return rateLimited;

    const parsed = await validateRequest(req, ChatRequestSchema);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const scanSummary = body.scanSummary ?? undefined;
    const issueFocus = body.issueFocus ?? null;
    const explanationContext =
      typeof body.explanationContext === "string"
        ? body.explanationContext.slice(0, 24_000)
        : null;

    const { text, model } = await chatWithContext(
      body.messages,
      scanSummary,
      issueFocus,
      explanationContext,
    );
    return NextResponse.json({ reply: sanitiseHtml(text), model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    const misconfigured =
      message.includes("ASSEMBLYAI_API_KEY") ||
      message.includes("ANTHROPIC_API_KEY") ||
      message.includes("GEMINI_API_KEY") ||
      message.includes("Configure ASSEMBLYAI_API_KEY");
    const status = misconfigured ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
