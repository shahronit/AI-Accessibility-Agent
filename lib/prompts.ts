import type { ScanIssue } from "@/lib/axeScanner";

const BASE_TEMPLATE = `You are an accessibility expert.

Explain the following accessibility issue in simple terms.
Include:

1. What is the issue
2. Why it matters for users
3. How to fix it (code example)
4. QA test steps

Issue:
{{issue_json}}

Additionally, include a **QA Mode** section with these exact headings and content:

**Test case title**
**Preconditions**
**Steps** (for each step that involves going to a page or view, start the step with the word **Navigate**)
**Expected result**
`;

export function buildExplainPrompt(issue: ScanIssue): string {
  const issueJson = JSON.stringify(issue, null, 2);
  return BASE_TEMPLATE.replace("{{issue_json}}", issueJson);
}

export function buildChatSystemPrompt(scanSummary?: {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
}): string {
  const base =
    "You are an expert accessibility consultant. Answer clearly and practically. Prefer WCAG-aligned guidance.";
  if (!scanSummary || scanSummary.total === 0) {
    return `${base} No scan results are loaded yet; you can still answer general accessibility questions.`;
  }
  return `${base}

Current scan context:
- URL: ${scanSummary.scannedUrl ?? "unknown"}
- Total findings: ${scanSummary.total}
- By impact: critical=${scanSummary.byImpact.critical}, serious=${scanSummary.byImpact.serious}, moderate=${scanSummary.byImpact.moderate}, minor=${scanSummary.byImpact.minor}
- Frequent rule ids: ${scanSummary.topRules.map((r) => `${r.id}(${r.count})`).join(", ")}
`;
}
