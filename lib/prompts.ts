import type { ScanIssue } from "@/lib/axeScanner";

const BASE_TEMPLATE = `You are an accessibility expert. Follow the structure below exactly (headings and section order).

Issue data (JSON):
{{issue_json}}

---

## Executive summary
- 3–5 bullets for developers and QA (plain language).

## 1. What is the issue
Clear description tied to the failing element/rule.

## 2. Why it matters
Impact on users (assistive tech, keyboard, vision, etc.).

## 3. Precise remediation (exact change)
Name the **most specific location you can infer** (component, template file type, route, or CSS layer). If unknown, say **Target:** with CSS selector or DOM area from the issue.

For every code change, use these exact prefixes so UI can color them:
- Lines to **insert** must start with: ✅ ADD (insert this):
- Lines to **delete or replace** must start with: ❌ REMOVE (delete or replace this):

Place the actual code/HTML in fenced blocks immediately after each prefix, for example:

✅ ADD (insert this):
\`\`\`html
<button type="button" aria-expanded="false">Menu</button>
\`\`\`

❌ REMOVE (delete or replace this):
\`\`\`html
<div onclick="openMenu()">Menu</div>
\`\`\`

Use the **issue's HTML snippet** inside REMOVE when it matches the failure. Do not use vague "example only" unless the issue has no HTML—then give the smallest realistic fragment.

## 4. QA Mode (tables only — no prose lists for these)

First table (metadata):

| Field | Details |
| Test case title | … |
| Preconditions | … |

Second table (steps — every navigation step must start with **Navigate** in the Action cell):

| Step # | Action | Expected result |
| 1 | Navigate to … | … |
| 2 | … | … |

## 5. Suggestions to improve further
- 3–7 bullets: optional hardening, tests, monitoring, design system, or related WCAG success criteria beyond the minimum fix.
`;

export function buildExplainPrompt(issue: ScanIssue): string {
  const issueJson = JSON.stringify(issue, null, 2);
  return BASE_TEMPLATE.replace("{{issue_json}}", issueJson);
}

export type ChatIssueFocus = {
  index: number;
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
};

const EXPLANATION_SNIP_MAX = 14_000;

const CHAT_FORMAT_HINT = `
When you give steps, prefer a markdown pipe table with columns: Step # | Action | Expected result.
When you show code fixes, prefix with ✅ ADD (insert this): or ❌ REMOVE (delete or replace this): before fenced code blocks.
End substantive answers with a short **Suggestions to improve further** bullet list when relevant.
`;

/**
 * System prompt for AI chat. When `issueFocus` + `explanationText` are set, the assistant must stay on that issue only.
 */
export function buildChatSystemPrompt(
  scanSummary?: {
    scannedUrl?: string;
    total: number;
    byImpact: Record<string, number>;
    topRules: { id: string; count: number }[];
  },
  focus?: {
    issue: ChatIssueFocus;
    explanationText: string | null;
  } | null,
): string {
  const base =
    "You are an expert accessibility consultant. Answer clearly and practically. Prefer WCAG-aligned guidance.";

  let scanBlock = "";
  if (scanSummary && scanSummary.total > 0) {
    scanBlock = `
Full automated scan context (every violation returned for this URL—not a single-issue sample):
- URL: ${scanSummary.scannedUrl ?? "unknown"}
- Total findings: ${scanSummary.total}
- By impact: critical=${scanSummary.byImpact.critical}, serious=${scanSummary.byImpact.serious}, moderate=${scanSummary.byImpact.moderate}, minor=${scanSummary.byImpact.minor}
- Frequent rule ids: ${scanSummary.topRules.map((r) => `${r.id}(${r.count})`).join(", ")}
`;
  } else {
    scanBlock = "\nNo scan results are loaded yet.\n";
  }

  if (focus?.issue) {
    const issueBlock = `
Focused issue (this is the user's current selection):
- Index: ${focus.issue.index}
- Rule: ${focus.issue.id}
- Impact: ${focus.issue.impact}
- Description: ${focus.issue.description}
- Help: ${focus.issue.helpUrl}
`;
    if (focus.explanationText?.trim()) {
      const snip = focus.explanationText.trim().slice(0, EXPLANATION_SNIP_MAX);
      return `${base}
${CHAT_FORMAT_HINT}

${scanBlock}
${issueBlock}

The dashboard still shows **all** findings that fail accessibility norms for this URL. The excerpt below is the **detailed AI explanation for the selected issue only**. For questions about **overall audit coverage, prioritization, other rule IDs, or testing strategy**, use the full scan summary and treat every finding as in scope. For **narrow follow-ups** (QA steps, code diffs, WCAG mapping) about this specific issue, lean on the excerpt.

--- AI explanation excerpt (selected issue) ---
${snip}
--- end excerpt ---
`;
    }
    return `${base}
${CHAT_FORMAT_HINT}

${scanBlock}
${issueBlock}

An issue row is selected. Answer narrowly about that issue when asked—but if the user asks about the **whole scan**, **all violations**, or how results compare to norms overall, respond using the **full** scan summary and do not imply the page has only one problem. Suggest "Explain with AI" for a long-form write-up of this row if needed.
`;
  }

  return `${base}
${CHAT_FORMAT_HINT}

${scanBlock}
No row is selected. Help the user interpret **all** findings together: severity mix, common themes, remediation order, and how they relate to WCAG. Never suggest the scan is about a single issue unless only one finding exists.
`;
}
