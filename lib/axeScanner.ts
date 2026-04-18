import type { Result, NodeResult } from "axe-core";

export type ImpactLevel = "critical" | "serious" | "moderate" | "minor";

/** Violation vs axe “incomplete” (manual review) */
export type ScanIssueKind = "violation" | "needs_review";

/**
 * Which scanner flagged the issue.
 *  - "axe": axe-core only (the default; legacy callers don't set this field)
 *  - "ibm": IBM Equal Access only
 *  - "both": both tools agree on the same WCAG criterion at the same node;
 *    `mergeFindings` bumps impact one rung in this case.
 */
export type ScanIssueSource = "axe" | "ibm" | "both";

/** Returned when POST /api/scan includes includeAxeOverview: true */
export type AxeOverviewStats = {
  passRules: number;
  incompleteRules: number;
  incompleteInstances: number;
};

/** Prefer incomplete node count; if zero but rules exist, use rule count (axe overview). */
export function axeIncompleteReviewCount(overview: AxeOverviewStats | null | undefined): number {
  if (overview == null) return 0;
  return overview.incompleteInstances > 0
    ? overview.incompleteInstances
    : (overview.incompleteRules ?? 0);
}

export interface ScanIssue {
  /** 1-based index in the flattened issue list (for voice: "explain issue 1") */
  index: number;
  /** axe rule id */
  id: string;
  description: string;
  impact: ImpactLevel;
  /** Violation (default) or axe incomplete / needs manual review */
  kind?: ScanIssueKind;
  html: string;
  helpUrl: string;
  failureSummary?: string;
  /** Serialized axe selector paths for context */
  targets?: unknown[];
  /** Set when merging batch scan results */
  sourceUrl?: string;
  /**
   * Which scanner produced this issue. Optional for backwards compatibility:
   * older callers (and the SQLite history rows persisted before Fix 5) omit
   * the field, which is treated as "axe" everywhere we branch on it.
   */
  source?: ScanIssueSource;
  /**
   * WCAG SC reference for the issue, e.g. `"1.4.3"`. Used as the dedup key
   * when merging axe + IBM findings; falls back to `id` when unavailable.
   */
  wcagCriterion?: string;
}

const IMPACT_ORDER: ImpactLevel[] = ["critical", "serious", "moderate", "minor"];

/**
 * Pull a WCAG SC number out of an axe tag set. axe tags look like
 * `wcag2a`, `wcag143`, `wcag22aa`, etc. We want the criterion-specific tags
 * (`wcag143`) and convert them to dotted form (`1.4.3`). Returns the first
 * match so dedup is deterministic.
 */
export function extractWcagCriterion(tags: readonly string[] | undefined | null): string | undefined {
  if (!tags) return undefined;
  for (const tag of tags) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/i.exec(tag);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  }
  return undefined;
}

function bumpImpact(impact: ImpactLevel): ImpactLevel {
  const idx = IMPACT_ORDER.indexOf(impact);
  if (idx <= 0) return impact; // already critical
  return IMPACT_ORDER[idx - 1]!;
}

function mapImpact(impact: string | undefined | null): ImpactLevel {
  if (impact === "critical" || impact === "serious" || impact === "moderate" || impact === "minor") {
    return impact;
  }
  return "moderate";
}

function truncateHtml(html: string, max = 2000): string {
  if (html.length <= max) return html;
  return `${html.slice(0, max)}…`;
}

/**
 * Flatten axe violations or incomplete results to one record per node for UI and AI context.
 */
export function normalizeAxeViolations(
  violations: Result[],
  options?: { sourceUrl?: string; kind?: ScanIssueKind },
): ScanIssue[] {
  const sourceUrl = options?.sourceUrl;
  const kind: ScanIssueKind = options?.kind ?? "violation";
  const issues: ScanIssue[] = [];
  let index = 1;

  for (const v of violations) {
    const wcagCriterion = extractWcagCriterion(v.tags);
    const nodes: NodeResult[] = v.nodes?.length ? v.nodes : [];
    if (nodes.length === 0) {
      issues.push({
        index: index++,
        id: v.id,
        description: v.help || v.description,
        impact: mapImpact(v.impact),
        ...(kind !== "violation" ? { kind } : {}),
        html: "",
        helpUrl: v.helpUrl,
        failureSummary: v.description,
        ...(sourceUrl ? { sourceUrl } : {}),
        source: "axe",
        ...(wcagCriterion ? { wcagCriterion } : {}),
      });
      continue;
    }

    for (const node of nodes) {
      issues.push({
        index: index++,
        id: v.id,
        description: v.help || v.description,
        impact: mapImpact(v.impact),
        ...(kind !== "violation" ? { kind } : {}),
        html: truncateHtml(node.html || ""),
        helpUrl: v.helpUrl,
        failureSummary: node.failureSummary || v.description,
        targets: node.target as unknown[],
        ...(sourceUrl ? { sourceUrl } : {}),
        source: "axe",
        ...(wcagCriterion ? { wcagCriterion } : {}),
      });
    }
  }

  issues.sort((a, b) => {
    const ia = IMPACT_ORDER.indexOf(a.impact);
    const ib = IMPACT_ORDER.indexOf(b.impact);
    if (ia !== ib) return ia - ib;
    return a.id.localeCompare(b.id);
  });

  // Re-number after sort so voice indices match visible order
  issues.forEach((issue, i) => {
    issue.index = i + 1;
  });

  return issues;
}

/**
 * Best-effort string we can hash to identify "the same DOM node" between
 * axe (CSS selectors) and IBM (xpath). They never produce identical
 * selectors, but the rendered HTML snippet is comparable, so we hash a
 * whitespace-collapsed prefix of the snippet. Falls back to the raw target
 * when the snippet is empty (e.g. page-level rules with no node).
 */
function selectorKey(issue: ScanIssue): string {
  const html = (issue.html ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (html.length > 0) return `html:${html}`;
  const target = Array.isArray(issue.targets) && issue.targets.length > 0
    ? String(issue.targets[0])
    : "";
  if (target.length > 0) return `target:${target.slice(0, 120)}`;
  return `id:${issue.id}`;
}

/**
 * Stable cross-scan dedup key used by both `mergeFindings` and the diff
 * layer in `lib/scan-store.ts`. Prefers WCAG criterion over rule id so an
 * axe `color-contrast` and an IBM `IBMA_Color_Contrast_WCAG2AA` for SC 1.4.3
 * collapse into one finding.
 */
export function issueDedupKey(issue: ScanIssue): string {
  const canonical = issue.wcagCriterion ?? issue.id;
  return `${canonical}::${selectorKey(issue)}`;
}

/**
 * Merge axe + IBM findings into one ranked list.
 *
 *  - Issues unique to either tool keep their original `source`.
 *  - Issues flagged by both tools collapse to a single record with
 *    `source: "both"`, an impact bumped one rung (the brief calls this the
 *    "double-flagged severity bump"), axe's helpUrl/failureSummary as the
 *    base, and IBM's message appended for context.
 *  - The merged list is re-sorted by IMPACT_ORDER and `index` is reassigned
 *    so voice navigation ("explain issue 3") still matches the on-screen
 *    order.
 */
export function mergeFindings(axe: ScanIssue[], ibm: ScanIssue[]): ScanIssue[] {
  const byKey = new Map<string, ScanIssue>();

  for (const a of axe) {
    const key = issueDedupKey(a);
    byKey.set(key, { ...a, source: a.source ?? "axe" });
  }

  for (const i of ibm) {
    const key = issueDedupKey(i);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...i, source: "ibm" });
      continue;
    }

    const mergedSummary = (() => {
      const base = existing.failureSummary ?? "";
      const extra = i.failureSummary ?? i.description ?? "";
      if (!extra) return base;
      if (base.includes(extra)) return base;
      return base ? `${base}\nIBM: ${extra}` : `IBM: ${extra}`;
    })();

    byKey.set(key, {
      ...existing,
      source: "both",
      impact: bumpImpact(existing.impact),
      failureSummary: mergedSummary,
      wcagCriterion: existing.wcagCriterion ?? i.wcagCriterion,
    });
  }

  const merged = Array.from(byKey.values());

  merged.sort((a, b) => {
    const ia = IMPACT_ORDER.indexOf(a.impact);
    const ib = IMPACT_ORDER.indexOf(b.impact);
    if (ia !== ib) return ia - ib;
    return a.id.localeCompare(b.id);
  });

  merged.forEach((issue, i) => {
    issue.index = i + 1;
  });

  return merged;
}

export function summarizeIssues(issues: ScanIssue[]) {
  const byImpact: Record<ImpactLevel, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  const ruleIds = new Map<string, number>();
  for (const issue of issues) {
    byImpact[issue.impact]++;
    ruleIds.set(issue.id, (ruleIds.get(issue.id) ?? 0) + 1);
  }
  const topRules = [...ruleIds.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, count]) => ({ id, count }));
  return { total: issues.length, byImpact, topRules };
}
