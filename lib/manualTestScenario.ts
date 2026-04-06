import type { ScanIssue } from "@/lib/axeScanner";

export type ManualTestCase = {
  testScenario: string;
  testCaseTitle: string;
  steps: string;
  /** Baseline from automation or "Run manual test — not determined by axe." */
  actualResult: string;
  expectedResult: string;
};

export type ManualTestCasesPayload = {
  testCases: ManualTestCase[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parseManualTestCasesJson(raw: string): ManualTestCase[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") return [];
  const tc = (parsed as ManualTestCasesPayload).testCases;
  if (!Array.isArray(tc)) return [];
  const out: ManualTestCase[] = [];
  for (const row of tc) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (
      !isNonEmptyString(o.testScenario) ||
      !isNonEmptyString(o.testCaseTitle) ||
      !isNonEmptyString(o.steps) ||
      !isNonEmptyString(o.actualResult) ||
      !isNonEmptyString(o.expectedResult)
    ) {
      continue;
    }
    out.push({
      testScenario: o.testScenario.trim(),
      testCaseTitle: o.testCaseTitle.trim(),
      steps: o.steps.trim(),
      actualResult: o.actualResult.trim(),
      expectedResult: o.expectedResult.trim(),
    });
  }
  return out;
}

export function issuesPayloadCompact(issues: ScanIssue[], max = 60) {
  return issues.slice(0, max).map((i) => ({
    index: i.index,
    id: i.id,
    impact: i.impact,
    description: i.description.slice(0, 800),
    helpUrl: i.helpUrl,
    htmlSnippet: i.html.slice(0, 500),
  }));
}
