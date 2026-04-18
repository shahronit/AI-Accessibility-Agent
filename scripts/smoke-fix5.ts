/**
 * Smoke test for Fix 5 pure helpers (no Redis, no browser).
 * Run with: npx tsx scripts/smoke-fix5.ts
 */
import assert from "node:assert";

async function main() {
  const axeMod = await import("../lib/axeScanner");
  const storeMod = await import("../lib/scan-store");

  const { mergeFindings, issueDedupKey, extractWcagCriterion } = axeMod;
  const { diffScans } = storeMod;

  // 1) extractWcagCriterion converts axe tags to dotted form
  assert.strictEqual(extractWcagCriterion(["wcag2a", "wcag143", "cat.color"]), "1.4.3");
  assert.strictEqual(extractWcagCriterion(["wcag22aa"]), undefined);
  assert.strictEqual(extractWcagCriterion(undefined), undefined);
  console.log("✓ extractWcagCriterion works");

  // 2) mergeFindings: same WCAG criterion + same html → "both" with bumped impact
  const axeIssue = {
    index: 1,
    id: "color-contrast",
    description: "Insufficient contrast",
    impact: "moderate" as const,
    html: "<button class='cta'>Submit</button>",
    helpUrl: "https://dequeuniversity.com/...",
    failureSummary: "axe summary",
    source: "axe" as const,
    wcagCriterion: "1.4.3",
  };
  const ibmIssue = {
    index: 1,
    id: "IBMA_Color_Contrast_WCAG2AA",
    description: "Color contrast violation",
    impact: "serious" as const,
    html: "<button class='cta'>Submit</button>",
    helpUrl: "https://able.ibm.com/...",
    failureSummary: "ibm summary",
    source: "ibm" as const,
    wcagCriterion: "1.4.3",
  };

  const merged = mergeFindings([axeIssue], [ibmIssue]);
  assert.strictEqual(merged.length, 1, "duplicates should collapse");
  assert.strictEqual(merged[0]!.source, "both");
  assert.strictEqual(merged[0]!.impact, "serious", "moderate should bump to serious");
  assert.ok(merged[0]!.failureSummary?.includes("IBM:"), "IBM message appended");
  console.log("✓ mergeFindings collapses + bumps severity");

  // 3) mergeFindings keeps unique issues from each tool
  const axeOnly = { ...axeIssue, html: "<a>only-axe</a>", id: "image-alt", wcagCriterion: "1.1.1" };
  const ibmOnly = { ...ibmIssue, html: "<form>only-ibm</form>", id: "form_label_unique", wcagCriterion: "3.3.2" };
  const merged2 = mergeFindings([axeOnly], [ibmOnly]);
  assert.strictEqual(merged2.length, 2);
  const sources = merged2.map((i) => i.source).sort();
  assert.deepStrictEqual(sources, ["axe", "ibm"]);
  console.log("✓ mergeFindings preserves unique issues");

  // 4) issueDedupKey is stable across whitespace/case
  const a = { ...axeIssue, html: "  <button class='cta'>Submit</button>  " };
  const b = { ...axeIssue, html: "<button class='cta'>Submit</button>" };
  assert.strictEqual(issueDedupKey(a), issueDedupKey(b));
  console.log("✓ issueDedupKey normalises whitespace");

  // 5) diffScans computes added/resolved/unchanged
  const baseline = {
    scanId: "s1",
    url: "https://example.com",
    scannedAt: new Date().toISOString(),
    wcagPreset: "wcag22-aa" as const,
    issues: [axeIssue, axeOnly],
    reviewIssues: [],
    summary: { total: 2, byImpact: { critical: 0, serious: 0, moderate: 1, minor: 0 }, topRules: [] },
    axeOverview: null,
    sources: { axe: true, ibm: false },
  };
  const latest = {
    ...baseline,
    scanId: "s2",
    issues: [
      // resolved axeOnly; kept axeIssue; added new ibm-only
      axeIssue,
      { ...ibmOnly },
    ],
  };
  const diff = diffScans(baseline, latest);
  assert.strictEqual(diff.summary.added, 1, "ibmOnly is new");
  assert.strictEqual(diff.summary.resolved, 1, "axeOnly is resolved");
  assert.strictEqual(diff.summary.unchanged, 1, "axeIssue is unchanged");
  console.log("✓ diffScans computes added/resolved/unchanged correctly");

  console.log("\nAll Fix 5 smoke tests passed.");
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
