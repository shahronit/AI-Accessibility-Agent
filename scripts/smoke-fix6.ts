/**
 * Fix 6 smoke test:
 *  1. `explainAllIssues` enforces concurrency=3 and survives partial failures.
 *  2. `pickTopIssues` orders by severity (critical -> serious -> ...).
 *  3. `scanCacheKey` is deterministic across runs and varies with options.
 *
 * Runs without hitting Chromium / Upstash / live LLMs - we monkey-patch
 * the global `fetch` so `postAppJson` resolves locally.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export {};

async function main() {
  // --- mock browser globals so the "use client" modules can load ---
  const g = globalThis as any;
  g.window = g.window ?? {
    location: { origin: "http://localhost:3000" },
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: any) => clearTimeout(id),
  };
  g.localStorage = g.localStorage ?? {
    _data: new Map<string, string>(),
    getItem(k: string) {
      return this._data.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      this._data.set(k, v);
    },
    removeItem(k: string) {
      this._data.delete(k);
    },
  };

  // Track concurrency
  let inFlight = 0;
  let peakInFlight = 0;
  const failingIssueIds = new Set<string>(["fail-rule"]);

  g.fetch = async (url: string, init: any) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      // Simulate a slow LLM hop so concurrent calls overlap
      await new Promise((r) => setTimeout(r, 50));
      const body = JSON.parse(init.body);
      const id = body.issue.id as string;
      if (failingIssueIds.has(id)) {
        return new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ explanation: `explanation for ${id}`, model: "test-model" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    } finally {
      inFlight -= 1;
    }
  };

  const { explainAllIssues, pickTopIssues } = await import("../lib/explain-all");
  const { scanCacheKey } = await import("../lib/scan-store");

  // --- Test 1: scanCacheKey determinism + variation ---
  const k1 = scanCacheKey("https://example.com/", { wcagPreset: "wcag22-aa", deepScan: false });
  const k2 = scanCacheKey("https://example.com/", { wcagPreset: "wcag22-aa", deepScan: false });
  const k3 = scanCacheKey("https://example.com/", { wcagPreset: "wcag22-aa", deepScan: true });
  if (k1 !== k2) throw new Error("scanCacheKey not deterministic");
  if (k1 === k3) throw new Error("scanCacheKey did not vary on options");
  console.log("[ok] scanCacheKey is deterministic and options-aware");

  // --- Test 2: pickTopIssues severity ordering ---
  const issues: any[] = [
    { index: 1, id: "minor-rule", impact: "minor", description: "x", html: "<a/>", helpUrl: "", target: ["a"], kind: "violation" },
    { index: 2, id: "critical-rule", impact: "critical", description: "x", html: "<b/>", helpUrl: "", target: ["b"], kind: "violation" },
    { index: 3, id: "moderate-rule", impact: "moderate", description: "x", html: "<c/>", helpUrl: "", target: ["c"], kind: "violation" },
    { index: 4, id: "serious-rule", impact: "serious", description: "x", html: "<d/>", helpUrl: "", target: ["d"], kind: "violation" },
    { index: 5, id: "fail-rule", impact: "critical", description: "x", html: "<e/>", helpUrl: "", target: ["e"], kind: "violation" },
  ];
  const top3 = pickTopIssues(issues, 3);
  if (top3.length !== 3) throw new Error(`pickTopIssues length ${top3.length}`);
  if (top3[0].impact !== "critical" || top3[1].impact !== "critical" || top3[2].impact !== "serious") {
    throw new Error(`pickTopIssues order wrong: ${top3.map((i) => i.impact).join(",")}`);
  }
  console.log("[ok] pickTopIssues orders by severity");

  // --- Test 3: explainAllIssues concurrency cap + Promise.allSettled fallback ---
  const progress: number[] = [];
  const result = await explainAllIssues(issues, {
    concurrency: 3,
    onResult: (ev) => progress.push(ev.done),
  });

  if (peakInFlight > 3) {
    throw new Error(`concurrency cap broken: peakInFlight=${peakInFlight}`);
  }
  if (peakInFlight < 2) {
    throw new Error(`expected parallelism, peakInFlight=${peakInFlight}`);
  }
  if (result.failures.length !== 1 || result.failures[0].issue.id !== "fail-rule") {
    throw new Error(`expected exactly 1 failure for fail-rule, got ${result.failures.length}`);
  }
  if (result.explanations.size !== 4) {
    throw new Error(`expected 4 explanations, got ${result.explanations.size}`);
  }
  if (progress[progress.length - 1] !== issues.length) {
    throw new Error(`progress did not reach total: ${progress.join(",")}`);
  }
  console.log(
    `[ok] explainAllIssues concurrency=${peakInFlight}/3 cap respected, ${result.explanations.size} ok, ${result.failures.length} settled-failure`,
  );

  console.log("\nALL FIX 6 SMOKE TESTS PASSED");
}

main().catch((err) => {
  console.error("smoke-fix6 failed:", err);
  process.exit(1);
});
