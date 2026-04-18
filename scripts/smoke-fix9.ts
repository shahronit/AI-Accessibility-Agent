/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Smoke test for Fix 9 — Zod schemas + validateRequest helper.
 *
 * Run with: `npx tsx scripts/smoke-fix9.ts`
 *
 * The `export {}` keeps every smoke-script `main()` in its own module
 * scope when the project is type-checked as a single program.
 */
export {};

import { strict as assert } from "node:assert";

async function main() {
  const {
    ScanRequestSchema,
    AiExplainRequestSchema,
    ChatRequestSchema,
    TestingAnalysisRequestSchema,
    TestingScenariosRequestSchema,
    ScanIssueSchema,
  } = await import("../lib/schemas");
  const { validateRequest, validateValue } = await import("../lib/validate-request");

  console.log("== ScanRequestSchema ==");
  assert.equal(ScanRequestSchema.safeParse({}).success, false, "empty body must fail");
  assert.equal(
    ScanRequestSchema.safeParse({ url: "https://example.com" }).success,
    true,
    "minimal valid body must pass",
  );
  assert.equal(
    ScanRequestSchema.safeParse({ url: "x".repeat(2049) }).success,
    false,
    "url > 2048 chars must fail",
  );
  assert.equal(
    ScanRequestSchema.safeParse({ url: "https://x", maxPages: 99 }).success,
    false,
    "maxPages > 20 must fail",
  );
  assert.equal(
    ScanRequestSchema.safeParse({
      url: "https://x",
      cookies: [{ name: "a", value: "b", domain: "x.com", path: "/" }],
    }).success,
    true,
    "valid cookies array must pass",
  );
  assert.equal(
    ScanRequestSchema.safeParse({ url: "https://x", cookies: null }).success,
    true,
    "null cookies must pass (treated as omitted)",
  );

  console.log("== ScanIssueSchema ==");
  const issue = {
    index: 0,
    id: "color-contrast",
    description: "Element has insufficient color contrast",
    impact: "serious",
    html: "<div>x</div>",
    helpUrl: "https://dequeuniversity.com/rules/axe/4/color-contrast",
  };
  assert.equal(ScanIssueSchema.safeParse(issue).success, true, "minimal issue must pass");
  assert.equal(
    ScanIssueSchema.safeParse({ ...issue, impact: "low" }).success,
    false,
    "unknown impact must fail",
  );
  assert.equal(
    ScanIssueSchema.safeParse({ ...issue, source: "lighthouse" }).success,
    false,
    "unknown source must fail",
  );
  assert.equal(
    ScanIssueSchema.safeParse({ ...issue, source: "both" }).success,
    true,
    "valid source 'both' must pass",
  );

  console.log("== AiExplainRequestSchema ==");
  assert.equal(AiExplainRequestSchema.safeParse({ issue }).success, true);
  assert.equal(AiExplainRequestSchema.safeParse({}).success, false);

  console.log("== ChatRequestSchema ==");
  assert.equal(
    ChatRequestSchema.safeParse({ messages: [{ role: "user", content: "hi" }] }).success,
    true,
    "minimal chat must pass",
  );
  assert.equal(ChatRequestSchema.safeParse({ messages: [] }).success, false, "empty messages fail");
  assert.equal(
    ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "x" }],
      issueFocus: { index: 1, id: "x", impact: "minor", description: "d", helpUrl: "u" },
    }).success,
    true,
    "valid issueFocus must pass",
  );
  assert.equal(
    ChatRequestSchema.safeParse({
      messages: [{ role: "system", content: "x" }],
    }).success,
    false,
    "role 'system' must fail",
  );

  console.log("== TestingAnalysisRequestSchema ==");
  assert.equal(
    TestingAnalysisRequestSchema.safeParse({
      scannedUrl: "https://x",
      mode: "expert-audit",
      issues: [issue],
      priority: "aa-aaa",
      outputFormat: "jira",
    }).success,
    true,
  );
  assert.equal(
    TestingAnalysisRequestSchema.safeParse({
      scannedUrl: "https://x",
      mode: "imaginary",
      issues: [],
    }).success,
    false,
    "unknown mode must fail",
  );
  assert.equal(
    TestingAnalysisRequestSchema.safeParse({
      scannedUrl: "https://x",
      mode: "pour",
      issues: new Array(501).fill(issue),
    }).success,
    false,
    "issues > 500 must fail",
  );

  console.log("== TestingScenariosRequestSchema ==");
  assert.equal(
    TestingScenariosRequestSchema.safeParse({ scannedUrl: "https://x", issues: [] }).success,
    true,
  );
  assert.equal(
    TestingScenariosRequestSchema.safeParse({ issues: [] }).success,
    false,
    "missing scannedUrl must fail",
  );

  console.log("== validateRequest helper ==");

  // Mock Request: good JSON body, valid schema.
  const good = new Request("http://x", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com" }),
    headers: { "content-type": "application/json" },
  });
  const goodRes = await validateRequest(good, ScanRequestSchema);
  assert.equal(goodRes.ok, true, "valid body returns ok=true");
  assert.equal((goodRes as any).data.url, "https://example.com");

  // Mock Request: bad JSON body.
  const badJson = new Request("http://x", {
    method: "POST",
    body: "not json",
    headers: { "content-type": "application/json" },
  });
  const badJsonRes = await validateRequest(badJson, ScanRequestSchema);
  assert.equal(badJsonRes.ok, false, "bad JSON returns ok=false");
  if (!badJsonRes.ok) {
    assert.equal(badJsonRes.error.status, 400);
    const json = await badJsonRes.error.json();
    assert.equal(typeof json.error, "string");
    assert.equal(json.details, null, "details=null on JSON parse failure");
  }

  // Mock Request: schema mismatch.
  const badShape = new Request("http://x", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "content-type": "application/json" },
  });
  const badShapeRes = await validateRequest(badShape, ScanRequestSchema);
  assert.equal(badShapeRes.ok, false, "missing url returns ok=false");
  if (!badShapeRes.ok) {
    assert.equal(badShapeRes.error.status, 400);
    const json = await badShapeRes.error.json();
    assert.equal(json.error, "Invalid request");
    assert.ok(json.details, "details object present on Zod failure");
    assert.ok(
      json.details.fieldErrors?.url || json.details.formErrors,
      "details.fieldErrors.url is present",
    );
  }

  // validateValue smoke (used by query-string validators).
  const okV = validateValue({ url: "https://example.com" }, ScanRequestSchema);
  assert.equal(okV.ok, true);
  const badV = validateValue({}, ScanRequestSchema);
  assert.equal(badV.ok, false);

  console.log("\nAll Fix 9 smoke checks passed.");
}

main().catch((e) => {
  console.error("smoke FAILED:", e);
  process.exit(1);
});
