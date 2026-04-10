/**
 * Summarize Chrome DevTools Protocol Accessibility.getFullAXTree output (best-effort).
 * Shape varies slightly by Chrome version; keep parsing defensive.
 */
export type ChromeAxTreeSummary = {
  totalNodes: number;
  nonIgnoredCount: number;
  topRoles: { role: string; count: number }[];
};

type AxRole = { value?: string } | undefined;

type AxNode = {
  ignored?: boolean;
  role?: AxRole;
};

function roleLabel(node: AxNode): string {
  const v = node.role?.value;
  return typeof v === "string" && v.trim() ? v.trim() : "unknown";
}

export function summarizeChromeAxTree(nodes: unknown): ChromeAxTreeSummary | null {
  if (!Array.isArray(nodes)) return null;
  const list = nodes as AxNode[];
  const totalNodes = list.length;
  let nonIgnoredCount = 0;
  const roles = new Map<string, number>();
  for (const n of list) {
    if (n?.ignored) continue;
    nonIgnoredCount++;
    const r = roleLabel(n);
    roles.set(r, (roles.get(r) ?? 0) + 1);
  }
  const topRoles = [...roles.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([role, count]) => ({ role, count }));
  return { totalNodes, nonIgnoredCount, topRoles };
}
