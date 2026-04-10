import type { Result, NodeResult } from "axe-core";

export type ImpactLevel = "critical" | "serious" | "moderate" | "minor";

/** Violation vs axe “incomplete” (manual review) */
export type ScanIssueKind = "violation" | "needs_review";

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
}

const IMPACT_ORDER: ImpactLevel[] = ["critical", "serious", "moderate", "minor"];

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
