import type { ScanIssue } from "@/lib/axeScanner";
import { TESTING_NORMATIVE_BASIS } from "@/lib/testingNorms";

export type TestingAnalysisMode = "pour" | "methods" | "checkpoints" | "comprehensive";

const BASE_AGENT = `You are the Accessibility AI Agent. You receive the **complete** list of automated findings from an axe-core scan (every violation detected for the page—not a single-issue sample). Your job is to analyze **all** findings together in relation to the requested framework. Reference specific rule IDs and issue indices from the data. If many issues share a theme, group them. Do not pretend only one issue exists.

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
Below is JSON for ${capped} findings (the full set of violations returned by the tool, up to the cap).${tail}`;
}

export function buildTestingAnalysisMessages(
  scannedUrl: string,
  issues: ScanIssue[],
  mode: TestingAnalysisMode,
): { system: string; user: string } {
  if (issues.length === 0) {
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

The axe scan returned **zero** violations for this URL. Write a concise report for mode **${mode}**: confirm the automated pass, state limits of automation, and supply a **non-repetitive** manual verification checklist drawn from **WebAIM’s WCAG 2 checklist** and **W3C Quickref** themes (plus **Granicus-style** task-flow checks where relevant). For **508**, note alignment with **WCAG 2.0 A/AA** only—not legacy §1194.22 tables. Tables optional. Still include ## Priority items to address with proactive verification steps (not empty boilerplate).`;
    const user = `Scanned URL: ${scannedUrl}
Total automated findings: 0
No findings JSON.`;
    return { system, user };
  }

  const cap = 80;
  const capped = issues.slice(0, cap);
  const payload = issuesPayload(issues, cap);
  const json = JSON.stringify(payload, null, 2);

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

Findings JSON:
${json}`;

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

Findings JSON:
${json}`;

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

Findings JSON:
${json}`;

    return { system, user };
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

Findings JSON:
${json}`;

  return { system, user };
}
