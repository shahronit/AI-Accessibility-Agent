import type { ScanIssue } from "@/lib/axeScanner";

export type TestingAnalysisMode = "pour" | "methods" | "checkpoints" | "comprehensive";

const BASE_AGENT = `You are the Accessibility AI Agent. You receive the **complete** list of automated findings from an axe-core scan (every violation detected for the page—not a single-issue sample). Your job is to analyze **all** findings together in relation to the requested framework. Reference specific rule IDs and issue indices from the data. If many issues share a theme, group them. Do not pretend only one issue exists.`;

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

The axe scan returned **zero** violations for this URL. Write a concise report for mode **${mode}**: confirm the automated pass, state limits of automation, and supply a **non-repetitive** checklist of manual / user-testing steps appropriate to this framework. Tables optional. Still include ## Priority items to address with proactive verification steps (not empty boilerplate).`;
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

Framework: **WCAG POUR** (W3C): Perceivable, Operable, Understandable, Robust.

Output structure:
## Executive overview
2–4 **unique** bullets on how the **entire scan** relates to accessibility norms (no copy-paste into later sections).

## Perceivable
Map **all** relevant findings (alt text, contrast, captions, etc.). Table: | Issue # | Rule ID | Why it hurts perception | Brief fix direction |

## Operable
Keyboard, focus, timing, navigation, inputs—**only** findings not already fully covered in Perceivable; same table style.

## Understandable
Labels, language, predictability, errors—unique rows only.

## Robust
Parsing, ARIA, AT compatibility—unique rows only.

## Cross-cutting priorities
Top 5 remediation **themes** (grouped), not a repeat of table rows.

## What automated testing missed
Short list of gaps for **manual** or **user** testing—must not duplicate Executive overview wording.`;

    const user = `${intro}

Findings JSON:
${json}`;

    return { system, user };
  }

  if (mode === "methods") {
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

Framework: **Testing methods** — Automated (axe), Manual (expert + AT), User testing (people with disabilities).

Output:
## How automated results cover this URL
**Unique** summary of what axe proved—do not re-list every rule; aggregate by theme and severity.

## Manual testing plan (agent-generated)
Checklist for NVDA/JAWS/VoiceOver, focus order, reading order, custom widgets—**new** bullets not duplicated from the section above.

## User testing suggestions
3–6 study tasks informed by severity mix—each task **distinct**.

## Combined timeline suggestion
Phased timeline in **new** wording (no copy of prior bullets).`;

    const user = `${intro}

Findings JSON:
${json}`;

    return { system, user };
  }

  if (mode === "checkpoints") {
    const system = `${BASE_AGENT}

${OUTPUT_RULES}

Framework: **Key checkpoints** — Keyboard navigation, color contrast, alternative text, forms & labels.

For **each** checkpoint section, list **every** finding that applies (issue #, rule id, one line). If none, say "No automated findings in this bucket." Do **not** repeat the same finding’s description in a second checkpoint—assign it to the best-fit section only.

## Keyboard navigation
Tab/Enter/Space, focus traps, interactive elements.

## Color contrast
Contrast-related rules only.

## Alternative text
Images, icons, meaningful vs decorative.

## Forms and labels
Inputs, labels, errors, associations.

## Severity summary table
| Impact | Count | Representative rules | (aggregate only—no duplicate issue rows.)

## Next actions
Ordered developer actions **without** repeating full checkpoint tables—reference issue # / rule id.`;

    const user = `${intro}

Findings JSON:
${json}`;

    return { system, user };
  }

  // comprehensive
  const system = `${BASE_AGENT}

${OUTPUT_RULES}

Produce one integrated report:
1. **POUR** — one compact table per pillar; **no repeated rows** across pillars (each finding appears once, best pillar).
2. **Methods** — automation summary + manual + user testing in **non-overlapping** bullets.
3. **Checkpoints** — high-level mapping only if not already redundant with POUR (skip duplicate lists; cross-reference).
4. **Prioritized backlog** — merged duplicate themes, single source of truth.
5. **Honest limits** of axe-only testing — **unique** sentences.

Use ## headings and tables. Never analyze only one issue unless the scan truly contains one.`;

  const user = `${intro}

Findings JSON:
${json}`;

  return { system, user };
}
