import type { Result, NodeResult } from "axe-core";

export type ImpactLevel = "critical" | "serious" | "moderate" | "minor";

export interface ScanIssue {
  /** 1-based index in the flattened issue list (for voice: "explain issue 1") */
  index: number;
  /** axe rule id */
  id: string;
  description: string;
  impact: ImpactLevel;
  html: string;
  helpUrl: string;
  failureSummary?: string;
  /** Serialized axe selector paths for context */
  targets?: unknown[];
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
 * Flatten axe violations to one record per failing node for UI and AI context.
 */
export function normalizeAxeViolations(violations: Result[]): ScanIssue[] {
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
        html: "",
        helpUrl: v.helpUrl,
        failureSummary: v.description,
      });
      continue;
    }

    for (const node of nodes) {
      issues.push({
        index: index++,
        id: v.id,
        description: v.help || v.description,
        impact: mapImpact(v.impact),
        html: truncateHtml(node.html || ""),
        helpUrl: v.helpUrl,
        failureSummary: node.failureSummary || v.description,
        targets: node.target as unknown[],
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
