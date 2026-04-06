import type { ScanIssue } from "@/lib/axeScanner";

const BASE_TEMPLATE = `You are an accessibility expert. Produce a concise, precise report suitable for engineering and QA stakeholders (corporate tone: neutral, direct, no hype).

Formatting rules (strict):
- Do not use Markdown heading syntax: no lines starting with # or ##.
- Do not use asterisks for emphasis, bold, or italics (no * or ** anywhere).
- Do not use underscore emphasis. Use Title Case section titles exactly as written below, each on its own line, followed by a blank line.
- Use short paragraphs and tight bullets. No decorative markdown.

Issue data (JSON):
{{issue_json}}

---

Executive Summary
3–5 bullet lines for developers and QA. Each line must start with "- " (hyphen and space). Plain language only.

Section 1 — What Is the Issue
One or two focused paragraphs. Tie the failure to the rule id and the affected element or pattern.

Section 2 — Why It Matters
One or two paragraphs on user impact (assistive technology, keyboard, vision, cognition) and business risk where relevant.

Section 3 — Precise Remediation
State the most specific fix location you can infer (component, template, route, or stylesheet). If you cannot infer a file, begin a line with exactly: Target: followed by the CSS selector or DOM area from the issue data.

For code changes, the UI highlights these lines only if you use these exact prefixes (keep the check/cross symbols):
- Insertions must begin with: ✅ ADD (insert this):
- Removals or replacements must begin with: ❌ REMOVE (delete or replace this):

Immediately after each prefix, put the snippet in a fenced code block. Example shape (your content will differ):

✅ ADD (insert this):
\`\`\`html
<button type="button" aria-expanded="false">Menu</button>
\`\`\`

❌ REMOVE (delete or replace this):
\`\`\`html
<div onclick="openMenu()">Menu</div>
\`\`\`

Use the issue HTML snippet inside REMOVE when it matches the failure. If there is no HTML, give the smallest realistic fragment.

Section 4 — QA Verification
This section must contain only two markdown pipe tables (no bullet lists here).

First table:

| Field | Details |
| Test case title | … |
| Preconditions | … |

Second table. Any step that opens a page or view must include the word Navigate in the Action cell.

| Step # | Action | Expected result |
| 1 | Navigate to … | … |
| 2 | … | … |

Section 5 — Suggestions to Improve Further
3–7 bullet lines; each line starts with "- ". Optional hardening, regression tests, monitoring, design-system alignment, or related WCAG success criteria beyond the minimum fix.
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
