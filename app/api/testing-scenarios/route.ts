import { NextRequest, NextResponse } from "next/server";
import type { ScanIssue } from "@/lib/axeScanner";
import { generateManualTestScenarios } from "@/lib/aiClient";
import { sanitizeIssueForApi } from "@/lib/issueSanitize";
import { enforceRateLimit, aiLimiter } from "@/lib/rateLimit";
import { sanitiseHtml } from "@/lib/sanitise";
import type { ManualTestCase } from "@/lib/manualTestScenario";
import { TestingScenariosRequestSchema } from "@/lib/schemas";
import { validateRequest } from "@/lib/validate-request";

function sanitiseTestCase(tc: ManualTestCase): ManualTestCase {
  return {
    testScenario: sanitiseHtml(tc.testScenario),
    testCaseTitle: sanitiseHtml(tc.testCaseTitle),
    steps: sanitiseHtml(tc.steps),
    actualResult: sanitiseHtml(tc.actualResult),
    expectedResult: sanitiseHtml(tc.expectedResult),
  };
}

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(req, aiLimiter);
    if (rateLimited) return rateLimited;

    const parsed = await validateRequest(req, TestingScenariosRequestSchema);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const issues = body.issues as ScanIssue[];
    const sanitized = issues.map(sanitizeIssueForApi);

    const { testCases, model, raw } = await generateManualTestScenarios(
      body.scannedUrl.trim(),
      sanitized,
    );

    if (testCases.length === 0) {
      return NextResponse.json(
        {
          error:
            "The model did not return valid test cases JSON. Try again, or shorten the scan payload from the UI.",
          model,
          rawPreview: sanitiseHtml(raw.slice(0, 2000)),
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ testCases: testCases.map(sanitiseTestCase), model });
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
