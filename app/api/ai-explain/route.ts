import { NextRequest, NextResponse } from "next/server";
import type { ScanIssue } from "@/lib/axeScanner";
import { explainIssue } from "@/lib/aiClient";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { issue?: unknown };
    if (!isScanIssue(body.issue)) {
      return NextResponse.json({ error: "Invalid issue payload." }, { status: 400 });
    }

    const { text, model } = await explainIssue(body.issue);
    return NextResponse.json({ explanation: text, model });
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
