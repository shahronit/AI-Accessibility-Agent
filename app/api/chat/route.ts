import { NextRequest, NextResponse } from "next/server";
import { chatWithContext, type ChatMessage } from "@/lib/aiClient";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type ScanSummaryPayload = {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (o.role === "user" || o.role === "assistant") && typeof o.content === "string";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      messages?: unknown;
      scanSummary?: unknown;
    };

    if (!Array.isArray(body.messages) || !body.messages.every(isChatMessage)) {
      return NextResponse.json({ error: "messages must be an array of {role, content}" }, { status: 400 });
    }

    let scanSummary: ScanSummaryPayload | undefined;
    if (body.scanSummary && typeof body.scanSummary === "object") {
      const s = body.scanSummary as ScanSummaryPayload;
      if (typeof s.total === "number" && s.byImpact && Array.isArray(s.topRules)) {
        scanSummary = s;
      }
    }

    const { text, model } = await chatWithContext(body.messages, scanSummary);
    return NextResponse.json({ reply: text, model });
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
