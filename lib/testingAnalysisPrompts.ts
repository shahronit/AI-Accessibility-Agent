import type { ScanIssue } from "@/lib/axeScanner";
import {
  EXPERT_AUDIT_JIRA_TICKETS_SCHEMA_LITERAL,
  EXPERT_AUDIT_JSON_SCHEMA_LITERAL,
} from "@/lib/expertAuditSchema";
import { TESTING_NORMATIVE_BASIS } from "@/lib/testingNorms";
import { encodeStructuredForLlm, FINDINGS_TOON_HEADER } from "@/lib/toonEncode";

export type TestingAnalysisMode =
  | "pour"
  | "methods"
  | "checkpoints"
  | "comprehensive"
  | "expert-audit";

export type ExpertAuditPriority = "aa" | "aa-aaa";
export type ExpertAuditOutputFormat = "markdown" | "json" | "jira";

export type TestingAnalysisOptions = {
  priority?: ExpertAuditPriority;
  outputFormat?: ExpertAuditOutputFormat;
};

const BASE_AGENT = `You are **A11yAgent**, an accessibility AI agent. You receive the **complete** list of automated findings from an axe-core scan (every violation detected for the page—not a single-issue sample). Findings in the user message use **TOON** (Token-Oriented Object Notation), not JSON—read tabular headers and row delimiters as the schema. Your job is to analyze **all** findings together in relation to the requested framework. Reference specific rule IDs and issue indices from the data. If many issues share a theme, group them. Do not pretend only one issue exists.

${TESTING_NORMATIVE_BASIS}`;

const OUTPUT_RULES = `OUTPUT RULES (strict):
- Use ## for section titles, **bold** for emphasis, and Markdown pipe tables where they help. Do not use # at the start of a line (use ## or deeper only).
- **No duplicate content:** Never repeat the same sentence, bullet, or table row in multiple sections. If something was already stated, refer back briefly (e.g. "As noted under Perceivable…") instead of copying.
- Each section must add **unique** analysis, data, or actions—not a restatement of the overview.
- Close with a section titled exactly: ## Priority items to address — a **numbered list** of distinct, actionable items. Do not re-list full issue descriptions here; reference **issue #** and **rule id** only.
- Keep tone professional; avoid filler disclaimers repeated across sections.`;

function issuesPayload(issues: ScanIssue[], max = 80) {
  const slice = issues.slice(0, max);
  return slice.map((i) => ({
    index: i.index,
    id: i.id,
    impact: i.impact,
    description: i.description,
    helpUrl: i.helpUrl,
    htmlSnippet: i.html.slice(0, 1000),
    failureSummary: i.failureSummary?.slice(0, 400) ?? null,
  }));
}

function userIntro(scannedUrl: string, total: number, capped: number) {
  const tail = total > capped ? `\n\nNote: ${total - capped} additional findings were omitted from this payload for size; mention that the live scan had ${total} total.` : "";
  return `Scanned URL: ${scannedUrl}
Total automated findings in this scan: ${total}
Below is **TOON** (Token-Oriented Object Notation) for ${capped} findings—the same fields as JSON would carry, in a compact tabular layout (fewer tokens).${tail}`;
}

export function buildTestingAnalysisMessages(
  scannedUrl: string,
  issues: ScanIssue[],
  mode: TestingAnalysisMode,
  options: TestingAnalysisOptions = {},
): { system: string; user: string } {
  if (issues.length === 0) {
    if (mode === "expert-audit") {
      return buildExpertAuditMessages(scannedUrl, [], options);
    }
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

The axe scan returned **zero** violations for this URL. Write a concise report for mode **${mode}**: confirm the automated pass, state limits of automation, and supply a **non-repetitive** manual verification checklist drawn from **WebAIM’s WCAG 2 checklist** and **W3C Quickref** themes (plus **Granicus-style** task-flow checks where relevant). For **508**, note alignment with **WCAG 2.0 A/AA** only—not legacy §1194.22 tables. Tables optional. Still include ## Priority items to address with proactive verification steps (not empty boilerplate).`;
    const user = `Scanned URL: ${scannedUrl}
Total automated findings: 0
No findings payload.`;
    return { system, user };
  }

  const cap = 80;
  const capped = issues.slice(0, cap);
  const payload = issuesPayload(issues, cap);
  const findingsToon = encodeStructuredForLlm(payload);

  const intro = userIntro(scannedUrl, issues.length, capped.length);

  if (mode === "pour") {
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

Framework: **WebAIM WCAG 2 Checklist structure** — same four pillars as W3C **POUR** (Guidelines **1.x Perceivable, 2.x Operable, 3.x Understandable, 4.x Robust**). Map each finding to the **best-matching guideline area** and name the **likely WCAG 2.x success criterion** (level A/AA/AAA when inferable from axe metadata).

Output structure:
## Executive overview
2–4 **unique** bullets on how the **entire scan** relates to these checklist norms (no copy-paste into later sections).

## Perceivable
Map **all** relevant findings (non-text content, time-based media, adaptable content, distinguishable—including contrast, reflow-related signals axe reports, etc.). Table: | Issue # | Rule ID | Likely WCAG SC | Checklist theme (WebAIM-style) | Brief fix direction |

## Operable
Keyboard, focus, timing, navigation, inputs, pointer/modality—**only** findings not already fully covered in Perceivable; **same table columns**.

## Understandable
Readable, predictable, input assistance—unique rows only; **same table columns**.

## Robust
Compatible (name/role/value, status messages, etc.)—unique rows only; **same table columns**.

## Cross-cutting priorities
Top 5 remediation **themes** (grouped), not a repeat of table rows.

## What automated testing missed
Short list of **WebAIM checklist / Quickref** items axe cannot fully prove—**manual or user** testing—must not duplicate Executive overview wording.`;

    const user = `${intro}

${FINDINGS_TOON_HEADER}:
${findingsToon}`;

    return { system, user };
  }

  if (mode === "methods") {
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

Framework: **Verification methods aligned to public checklists**
- **Automated:** axe results mapped to **W3C Quickref** success criteria where possible.
- **Manual expert / AT:** Walk high-value rows from **WebAIM’s WCAG 2 checklist** that automation did not exhaust (keyboard, reading order, custom components, focus visibility, error patterns, multimedia).
- **User research:** Tasks informed by findings and by **Granicus-style** real-world service journeys (end-to-end tasks, forms, critical content), without replacing WCAG coverage.
- **508 note:** If relevant, state verification targets **WCAG 2.0 A/AA** equivalence—not the outdated WebAIM §1194.22 checklist.

Output:
## How automated results cover this URL
**Unique** summary of what axe proved—do not re-list every rule; aggregate by **checklist principle** and severity; mention **likely WCAG SC** themes.

## Manual testing plan (agent-generated)
Numbered checklist: NVDA/JAWS/VoiceOver, focus order, reading order, custom widgets, contrast spot-checks—tied to **WebAIM checklist** categories; **new** bullets not duplicated from the section above.

## User testing suggestions
3–6 study tasks informed by severity mix—each **distinct** and **Granicus-informed** (citizen/task-oriented) where appropriate.

## Combined timeline suggestion
Phased timeline in **new** wording (no copy of prior bullets)—Automation → Manual (WebAIM-aligned) → User validation.`;

    const user = `${intro}

${FINDINGS_TOON_HEADER}:
${findingsToon}`;

    return { system, user };
  }

  if (mode === "checkpoints") {
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

Framework: **Essential checkpoints** — Merge **WebAIM WCAG 2 checklist** “high-signal” verification buckets with **Granicus-style** digital-service checks. Each section is a checkpoint category; cite **likely WCAG SC** in parentheses where clear.

For **each** checkpoint section, list **every** finding that applies (issue #, rule id, one line + optional SC). If none, say "No automated findings in this bucket." Do **not** repeat the same finding in a second checkpoint—assign it to the **best-fit** section only.

## Keyboard, focus, and interaction
Tab order, traps, operable controls, visible focus, shortcuts (2.x themes).

## Color, contrast, and non-text presentation
Text/UI contrast, use of color, non-text contrast (1.4.x, 2.5.8 where relevant).

## Text alternatives and media
Images, icons, meaningful vs decorative; captions/transcripts if signals exist in findings (1.1.x, 1.2.x).

## Structure, navigation, and language
Headings, landmarks, page title, link purpose, language of page/parts (2.4.x, 3.1.x).

## Forms, errors, and understandable inputs
Labels, instructions, errors, predictability (3.2.x, 3.3.x).

## Robustness and compatibility
ARIA/name-role-value, parsing-related signals, compatibility with AT (4.1.x).

## Severity summary table
| Impact | Count | Representative rules | (aggregate only—no duplicate issue rows.)

## Next actions
Ordered developer actions **without** repeating full checkpoint tables—reference issue # / rule id and **WCAG SC** when helpful.`;

    const user = `${intro}

${FINDINGS_TOON_HEADER}:
${findingsToon}`;

    return { system, user };
  }

  if (mode === "expert-audit") {
    return buildExpertAuditMessages(scannedUrl, issues, options);
  }

  // comprehensive
  const system = `${BASE_AGENT}

${OUTPUT_RULES}

Produce one integrated report aligned to **WebAIM WCAG 2 checklist + W3C Quickref SC naming**, with **508** framed as **WCAG 2.0 A/AA** (not legacy §1194.22) and **Granicus-style** extras for manual/task coverage:

1. **Checklist pillars (POUR)** — one compact table per principle; columns: | Issue # | Rule ID | Likely WCAG SC | WebAIM-style theme | Fix hint | — **no repeated rows** across pillars (each finding appears once, best pillar).
2. **Verification methods** — automation (axe) coverage + **WebAIM-aligned** manual plan + **Granicus-informed** user tasks — **non-overlapping** bullets.
3. **Essential checkpoints** — short cross-check only if not redundant (e.g. “Keyboard/focus bucket: see Operable table rows …”); avoid duplicate tables.
4. **Prioritized backlog** — merged themes, single source of truth; reference **WCAG SC** when possible.
5. **Honest limits** of axe-only testing vs full **Quickref** conformance — **unique** sentences.

Use ## headings and tables. Never analyze only one issue unless the scan truly contains one.`;

  const user = `${intro}

${FINDINGS_TOON_HEADER}:
${findingsToon}`;

  return { system, user };
}

/* -------------------------------------------------------------------------- */
/*                            Expert WCAG audit mode                          */
/* -------------------------------------------------------------------------- */

const EXPERT_AGENT_ROLE = `You are an expert AI accessibility testing agent with deep knowledge of WCAG 2.1, WCAG 2.2, WAI-ARIA 1.2, Section 508, and assistive technologies (NVDA, JAWS, VoiceOver, TalkBack). You think like a senior QA engineer who is also a certified CPACC.`;

const EXPERT_TASK = `Audit the provided web screen or component for accessibility violations across all WCAG 2.1 AA and WCAG 2.2 AA success criteria including: 1.1.1, 1.3.1, 1.3.2, 1.3.3, 1.4.1, 1.4.3, 1.4.4, 1.4.10, 1.4.11, 2.1.1, 2.1.2, 2.4.1, 2.4.2, 2.4.3, 2.4.4, 2.4.6, 2.4.7, 3.1.1, 3.2.1, 3.3.1, 3.3.2, 4.1.1, 4.1.2, 4.1.3, 2.4.11, 2.5.3, 3.2.6, 3.3.7.`;

const EXPERT_REASONING_CHAIN = `REASONING CHAIN (follow for every screen)
Step 1 — PARSE: Extract DOM structure, ARIA roles, labels, tabindex, heading hierarchy, colour values, font sizes, focus indicators from the supplied axe findings (each finding includes the offending HTML snippet, rule id, impact, and failure summary).
Step 2 — MAP: Map each element to applicable WCAG criteria.
Step 3 — TEST: For each criterion determine PASS / FAIL / MANUAL VERIFICATION with exact reason. Never mark uncertain items as PASS — use MANUAL VERIFICATION instead.
Step 4 — SEVERITY: Rate each failure as CRITICAL / SERIOUS / MODERATE / MINOR.
Step 5 — REMEDIATE: Provide exact before/after code fix, WCAG reference, and effort estimate.`;

const EXPERT_CONSTRAINTS = `CONSTRAINTS
- Never skip a criterion without justification.
- Always calculate contrast ratios using the WCAG luminance formula when colour values are present in the snippet; otherwise list the contrast check under MANUAL VERIFICATION.
- Never mark uncertain items as PASS.
- Always give concrete fix code (real HTML/CSS/ARIA — not "TBD" or pseudocode).
- Reference WCAG criterion numbers AND technique IDs (H37, G18, ARIA6, F77, etc.) for every finding.
- Test all interactive states implied by the markup: default, hover, focus, active, disabled, error.
- Group near-duplicate findings (same rule, same root cause) into a single numbered finding with multiple locations rather than repeating yourself.`;

const EXPERT_MARKDOWN_OUTPUT = `OUTPUT FORMAT (Markdown report — produce in this order, no extra preamble):

## Executive summary
2–4 sentences covering scope, total findings, and the highest-risk themes.

## Metrics
A pipe table with columns: | Metric | Value | covering at least: Total findings, Critical, Serious, Moderate, Minor, Criteria evaluated, Criteria passing, Criteria failing, Criteria needing manual verification.

## Findings
A numbered list. Each finding MUST use this exact sub-structure:

### Finding {n} — WCAG {criterion} ({severity})
- **Verdict:** FAIL | MANUAL VERIFICATION
- **Technique IDs:** comma-separated WCAG technique IDs (e.g. H37, G18, ARIA6)
- **Location:** CSS selector or human-readable element location
- **Description:** what is wrong and why it violates the criterion
- **User impact:** concrete description of what real users (including AT users) experience
- **Effort:** Small (<1 h) | Medium (1–4 h) | Large (>4 h) — include rough hours

**Before:**
\`\`\`html
<!-- verbatim broken markup -->
\`\`\`

**After:**
\`\`\`html
<!-- verbatim fix -->
\`\`\`

## Manual verification
A bulleted list of items that automation cannot decisively prove (e.g. screen-reader announcement quality, reading order in custom widgets, motion/animation triggers). One actionable line per item.

## Passed criteria
A bulleted list of WCAG SC numbers (e.g. \`1.3.1\`, \`2.4.2\`) for which the evidence in the findings supports a PASS. If you have no evidence either way, do NOT list the criterion here — surface it under Manual verification instead.`;

function expertJsonOutputBlock(): string {
  return `OUTPUT FORMAT (JSON only — no prose, no markdown headers, no explanation):

Return ONE fenced \`\`\`json\`\`\` code block (and nothing else) that conforms to this shape. Field names and casing are mandatory. Use empty arrays / empty strings rather than omitting required keys. Severity values MUST be one of CRITICAL, SERIOUS, MODERATE, MINOR. Verdict values MUST be one of FAIL, MANUAL VERIFICATION (do not emit PASS at the finding level — list passing criteria under \`passedCriteria\`).

\`\`\`json
${EXPERT_AUDIT_JSON_SCHEMA_LITERAL}
\`\`\``;
}

function expertJiraOutputBlock(): string {
  return `OUTPUT FORMAT (Markdown report + Jira tickets):

First produce the full Markdown report exactly as specified in the OUTPUT FORMAT (Markdown report) block.

Then, AFTER the report, append a single fenced \`\`\`json\`\`\` code block whose body matches this shape — one ticket per distinct finding (group near-duplicate findings into one ticket):

\`\`\`json
${EXPERT_AUDIT_JIRA_TICKETS_SCHEMA_LITERAL}
\`\`\`

Each ticket.summary MUST start with \`[A11y]\` and reference the WCAG criterion (e.g. \`[A11y] 1.4.3 — Insufficient contrast on primary CTA\`). Each ticket.description MUST include: WCAG criterion + technique IDs, severity, location, plain-language user impact, and the proposed fix snippet. Keep \`html\` ≤ 2000 characters.`;
}

function expertOutputForFormat(format: ExpertAuditOutputFormat): string {
  if (format === "json") return expertJsonOutputBlock();
  if (format === "jira") return `${EXPERT_MARKDOWN_OUTPUT}

${expertJiraOutputBlock()}`;
  return EXPERT_MARKDOWN_OUTPUT;
}

function expertPriorityClause(priority: ExpertAuditPriority): string {
  if (priority === "aa-aaa") {
    return `PRIORITY: WCAG 2.1 / 2.2 **AA** is the minimum bar. Where the evidence in the findings or supplied HTML clearly indicates an AAA issue (e.g. 1.4.6 enhanced contrast, 2.4.9 link purpose alone, 3.1.5 reading level), include it as a FINDING with severity proportional to user impact. When AAA-level evidence is ambiguous, list the AAA criterion under **Manual verification** rather than asserting PASS.`;
  }
  return `PRIORITY: WCAG 2.1 / 2.2 **AA** only. Do not invent AAA findings. If you happen to notice an AAA-only concern, mention it briefly under **Manual verification** but do not count it in the metrics or numbered findings.`;
}

function expertIssuesPayload(issues: ScanIssue[], max = 80) {
  const slice = issues.slice(0, max);
  return slice.map((i) => ({
    index: i.index,
    id: i.id,
    impact: i.impact,
    description: i.description,
    helpUrl: i.helpUrl,
    htmlSnippet: i.html.slice(0, 1200),
    failureSummary: i.failureSummary?.slice(0, 500) ?? null,
  }));
}

function buildExpertAuditMessages(
  scannedUrl: string,
  issues: ScanIssue[],
  options: TestingAnalysisOptions,
): { system: string; user: string } {
  const priority: ExpertAuditPriority = options.priority === "aa-aaa" ? "aa-aaa" : "aa";
  const outputFormat: ExpertAuditOutputFormat =
    options.outputFormat === "json" || options.outputFormat === "jira"
      ? options.outputFormat
      : "markdown";

  const system = `${EXPERT_AGENT_ROLE}

${EXPERT_TASK}

${expertPriorityClause(priority)}

${EXPERT_REASONING_CHAIN}

${EXPERT_CONSTRAINTS}

${expertOutputForFormat(outputFormat)}

INPUT NOTES
- The user message contains the scan URL plus axe-core findings encoded as **TOON** (Token-Oriented Object Notation). Read tabular headers and row delimiters as the schema.
- Treat each finding's \`htmlSnippet\` as ground truth for the offending element. You may infer additional WCAG criteria from the snippet that axe did not flag — surface those as additional findings.
- If the scan returned **zero** findings, do NOT fabricate violations. Produce the report skeleton with \`Total findings: 0\`, an empty Findings section ("No automated violations were detected."), and a thorough **Manual verification** list covering the criteria listed in the TASK above.`;

  if (issues.length === 0) {
    const user = `Scanned URL: ${scannedUrl}
Total automated findings: 0
No findings payload.`;
    return { system, user };
  }

  const cap = 80;
  const capped = issues.slice(0, cap);
  const payload = expertIssuesPayload(issues, cap);
  const findingsToon = encodeStructuredForLlm(payload);
  const tail =
    issues.length > capped.length
      ? `\n\nNote: ${issues.length - capped.length} additional findings were omitted from this payload for size; mention that the live scan had ${issues.length} total in the Executive summary.`
      : "";

  const user = `Scanned URL: ${scannedUrl}
Total automated findings in this scan: ${issues.length}
Below is **TOON** (Token-Oriented Object Notation) for ${capped.length} findings — the same fields as JSON would carry, in a compact tabular layout.${tail}

${FINDINGS_TOON_HEADER}:
${findingsToon}`;

  return { system, user };
}
