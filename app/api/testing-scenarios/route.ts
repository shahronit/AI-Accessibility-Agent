import { NextRequest, NextResponse } from "next/server";
import type { ScanIssue } from "@/lib/axeScanner";
import { generateManualTestScenarios } from "@/lib/aiClient";
import { sanitizeIssueForApi } from "@/lib/issueSanitize";

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
    const body = (await req.json()) as {
      scannedUrl?: unknown;
      issues?: unknown;
    };

    if (typeof body.scannedUrl !== "string" || !body.scannedUrl.trim()) {
      return NextResponse.json({ error: "Invalid or missing scannedUrl." }, { status: 400 });
    }

    if (!Array.isArray(body.issues)) {
      return NextResponse.json({ error: "Invalid issues array." }, { status: 400 });
    }

    if (body.issues.length > 0 && !body.issues.every(isScanIssue)) {
      return NextResponse.json({ error: "Invalid issue object in issues array." }, { status: 400 });
    }

    const issues = body.issues as ScanIssue[];
    const sanitized = issues.map(sanitizeIssueForApi);

    const { testCases, model, raw } = await generateManualTestScenarios(body.scannedUrl.trim(), sanitized);

    if (testCases.length === 0) {
      return NextResponse.json(
        {
          error:
            "The model did not return valid test cases JSON. Try again, or shorten the scan payload from the UI.",
          model,
          rawPreview: raw.slice(0, 2000),
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ testCases, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scenario generation failed";
    const misconfigured =
      message.includes("ASSEMBLYAI_API_KEY") ||
      message.includes("ANTHROPIC_API_KEY") ||
      message.includes("GEMINI_API_KEY") ||
      message.includes("Configure ASSEMBLYAI_API_KEY");
    const status = misconfigured ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
