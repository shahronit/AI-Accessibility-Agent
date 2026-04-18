/**
 * Fix 7 smoke test:
 *  1. Multiple `saveScan` calls populate the global recency index in
 *     newest-first order, capped at GLOBAL_HISTORY_LIMIT (we exercise a
 *     small subset and prove order, not the actual 500 cap).
 *  2. `listScans({ limit, offset })` pages correctly, returns total =
 *     LLEN of the index, and computes `diffVsPrevious` for adjacent runs
 *     of the same URL within the page.
 *  3. The `scan:url:{hash}:history` per-URL list still works.
 *
 * Uses a fully in-memory Redis stand-in injected via `getRedis()` so the
 * test never reaches Upstash.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export {};

type Entry = string | string[] | object;

class FakeRedis {
  store = new Map<string, Entry>();

  async set(key: string, value: string | object) {
    this.store.set(key, value);
    return "OK";
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const v = this.store.get(key);
    return (v === undefined ? null : (v as T));
  }

  async lpush(key: string, ...values: string[]) {
    const cur = (this.store.get(key) as string[] | undefined) ?? [];
    const next = [...values.slice().reverse(), ...cur];
    this.store.set(key, next);
    return next.length;
  }

  async ltrim(key: string, start: number, stop: number) {
    const cur = (this.store.get(key) as string[] | undefined) ?? [];
    const trimmed = cur.slice(start, stop + 1);
    this.store.set(key, trimmed);
    return "OK";
  }

  async lrange<T = string>(key: string, start: number, stop: number): Promise<T[]> {
    const cur = (this.store.get(key) as string[] | undefined) ?? [];
    const inclusive = stop === -1 ? cur.length : stop + 1;
    return cur.slice(start, inclusive) as T[];
  }

  async llen(key: string) {
    return ((this.store.get(key) as string[] | undefined) ?? []).length;
  }

  async mget<T = unknown>(...keys: string[]): Promise<T[]> {
    return keys.map((k) => (this.store.get(k) as T) ?? (null as unknown as T));
  }
}

async function main() {
  const fake = new FakeRedis();

  const upstash = await import("../lib/upstash");
  upstash.__setRedisForTests(fake);

  const { saveScan, listScans, listHistory } = await import("../lib/scan-store");

  const baseSummary = (critical: number, serious: number) => ({
    total: critical + serious,
    byImpact: { critical, serious, moderate: 0, minor: 0 },
    topRules: [],
  });

  const issues = (count: number, impact: "critical" | "serious") =>
    Array.from({ length: count }).map((_, i) => ({
      index: i + 1,
      id: `${impact}-rule-${i}`,
      description: "x",
      impact,
      html: `<p>${i}</p>`,
      helpUrl: "",
      target: [`p:nth-child(${i + 1})`],
    })) as any;

  // First scan for siteA: 2 critical
  await saveScan({
    scanId: "scan-A1",
    url: "https://a.example.com/",
    scannedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    wcagPreset: "wcag22-aa",
    issues: issues(2, "critical"),
    reviewIssues: [],
    summary: baseSummary(2, 0) as any,
    axeOverview: null,
    sources: { axe: true, ibm: false },
  });

  // Second scan for siteA: 1 critical, 1 serious - 1 added (serious-rule-0), 2 resolved (critical-rule-0,1)
  await saveScan({
    scanId: "scan-A2",
    url: "https://a.example.com/",
    scannedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    wcagPreset: "wcag22-aa",
    issues: [
      { index: 1, id: "critical-rule-0", description: "x", impact: "critical", html: "<p>0</p>", helpUrl: "", target: ["p:nth-child(1)"] },
      { index: 2, id: "serious-rule-0", description: "x", impact: "serious", html: "<p>0</p>", helpUrl: "", target: ["p:nth-child(1)"] },
    ] as any,
    reviewIssues: [],
    summary: baseSummary(1, 1) as any,
    axeOverview: null,
    sources: { axe: true, ibm: false },
  });

  // Two unrelated sites
  await saveScan({
    scanId: "scan-B1",
    url: "https://b.example.com/",
    scannedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    wcagPreset: "wcag22-aa",
    issues: issues(3, "critical"),
    reviewIssues: [],
    summary: baseSummary(3, 0) as any,
    axeOverview: null,
    sources: { axe: true, ibm: false },
  });
  await saveScan({
    scanId: "scan-C1",
    url: "https://c.example.com/",
    scannedAt: new Date(Date.now() - 1 * 60_000).toISOString(),
    wcagPreset: "wcag22-aa",
    issues: issues(1, "serious"),
    reviewIssues: [],
    summary: baseSummary(0, 1) as any,
    axeOverview: null,
    sources: { axe: true, ibm: false },
  });

  // --- Test 1: per-URL history still works ---
  const aHistory = await listHistory("https://a.example.com/");
  if (JSON.stringify(aHistory) !== JSON.stringify(["scan-A2", "scan-A1"])) {
    throw new Error(`per-URL history wrong: ${JSON.stringify(aHistory)}`);
  }
  console.log("[ok] per-URL listHistory ordering preserved");

  // --- Test 2: global index newest-first ---
  const page1 = await listScans({ limit: 2, offset: 0 });
  if (page1.total !== 4) throw new Error(`page1 total expected 4, got ${page1.total}`);
  if (page1.scans.length !== 2) throw new Error(`page1 length expected 2, got ${page1.scans.length}`);
  if (page1.scans[0].id !== "scan-C1" || page1.scans[1].id !== "scan-B1") {
    throw new Error(`page1 order wrong: ${page1.scans.map((s) => s.id).join(",")}`);
  }
  console.log("[ok] listScans page 1 newest-first");

  const page2 = await listScans({ limit: 2, offset: 2 });
  if (page2.scans[0].id !== "scan-A2" || page2.scans[1].id !== "scan-A1") {
    throw new Error(`page2 order wrong: ${page2.scans.map((s) => s.id).join(",")}`);
  }
  console.log("[ok] listScans page 2 paginates correctly");

  // --- Test 3: diffVsPrevious computed within a page for same URL ---
  // scan-A2 (newest) vs scan-A1 (older): added = 1 (serious-rule-0), resolved = 1 (critical-rule-1)
  const a2 = page2.scans[0];
  if (!a2.diffVsPrevious) throw new Error("scan-A2 missing diffVsPrevious");
  if (a2.diffVsPrevious.added !== 1 || a2.diffVsPrevious.resolved !== 1) {
    throw new Error(
      `scan-A2 diff wrong: added=${a2.diffVsPrevious.added}, resolved=${a2.diffVsPrevious.resolved}`,
    );
  }
  console.log(
    `[ok] diffVsPrevious computed within page (added=${a2.diffVsPrevious.added}, resolved=${a2.diffVsPrevious.resolved})`,
  );

  // --- Test 4: severity counts populated ---
  const c1 = page1.scans[0];
  if (c1.issueCount !== 1 || c1.seriousCount !== 1 || c1.criticalCount !== 0) {
    throw new Error(
      `severity projection wrong for C1: issueCount=${c1.issueCount}, critical=${c1.criticalCount}, serious=${c1.seriousCount}`,
    );
  }
  console.log("[ok] HistoryScan severity projection matches summarizeIssues");

  console.log("\nALL FIX 7 SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error("smoke-fix7 failed:", err);
  process.exit(1);
});
