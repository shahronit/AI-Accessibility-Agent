/**
 * Plain-language summary from severity counts (not a legal assessment; not a numeric score).
 */
export function complianceRiskFromCounts(
  byImpact: Record<string, number>,
  incompleteReview = 0,
): string {
  const c = byImpact.critical ?? 0;
  const s = byImpact.serious ?? 0;
  const m = byImpact.moderate ?? 0;
  const mi = byImpact.minor ?? 0;
  const total = c + s + m + mi;
  if (c > 0) return "Critical findings present — prioritize remediation.";
  if (s >= 5) return "Many serious findings — substantive review recommended.";
  if (s > 0 || total >= 15) return "Substantial review recommended based on issue volume.";
  if (total > 0 || incompleteReview > 0) return "Issues or items needing manual review were detected.";
  return "No violations were flagged in this automated pass.";
}
