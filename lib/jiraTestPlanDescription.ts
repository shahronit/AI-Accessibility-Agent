import type { ManualTestCase } from "@/lib/manualTestScenario";

export type JiraTestToolFormat = "generic" | "xray" | "zephyr";

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 80);
  }
}

/** One bundled manual accessibility suite as plain text (becomes Jira description / ADF). */
export function buildTestPlanDescription(
  scannedUrl: string,
  cases: ManualTestCase[],
  tool: JiraTestToolFormat,
): string {
  if (tool === "xray") return buildXrayStyle(scannedUrl, cases);
  if (tool === "zephyr") return buildZephyrStyle(scannedUrl, cases);
  return buildGeneric(scannedUrl, cases);
}

function buildGeneric(url: string, cases: ManualTestCase[]): string {
  const lines: string[] = [
    `**Target URL:** ${url}`,
    "",
    `**Suite:** Manual accessibility checks — ${cases.length} test case(s) in this issue.`,
    "",
  ];
  appendCasesGeneric(lines, cases);
  return truncate(lines.join("\n"));
}

function buildXrayStyle(url: string, cases: ManualTestCase[]): string {
  const host = hostnameFromUrl(url);
  const lines: string[] = [
    "Xray-oriented manual test (single Test issue — multiple definitions below).",
    "",
    `**Requirement / coverage:** WCAG-aligned accessibility regression for *${host}*`,
    "",
    `**Target URL:** ${url}`,
    "",
    `**Test type:** Manual`,
    "",
    "---",
    "",
  ];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    lines.push(`**Test definition ${i + 1}**`);
    lines.push("");
    lines.push(`*Summary / labels:* ${c.testScenario}`);
    lines.push("");
    lines.push(`*Test case title:* ${c.testCaseTitle}`);
    lines.push("");
    lines.push("*Preconditions / baseline (automation):*");
    lines.push(c.actualResult);
    lines.push("");
    lines.push("*Procedure (test script):*");
    lines.push(c.steps);
    lines.push("");
    lines.push("*Expected result:*");
    lines.push(c.expectedResult);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return truncate(lines.join("\n"));
}

function buildZephyrStyle(url: string, cases: ManualTestCase[]): string {
  const host = hostnameFromUrl(url);
  const lines: string[] = [
    "Zephyr Squad–oriented manual test (single Test issue).",
    "",
    `**Objective:** Validate accessibility for ${host}`,
    "",
    `**URL under test:** ${url}`,
    "",
    "**Test script** (grouped cases; execute in order per case block):",
    "",
  ];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    lines.push(`### Case ${i + 1}: ${c.testCaseTitle}`);
    lines.push("");
    lines.push(`**Component / area:** ${c.testScenario}`);
    lines.push("");
    lines.push("**Preconditions / baseline:**");
    lines.push(c.actualResult);
    lines.push("");
    lines.push("**Test steps:**");
    lines.push(c.steps);
    lines.push("");
    lines.push("**Expected outcome:**");
    lines.push(c.expectedResult);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return truncate(lines.join("\n"));
}

function appendCasesGeneric(lines: string[], cases: ManualTestCase[]) {
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    lines.push(`---`);
    lines.push(`**${i + 1}. ${c.testCaseTitle}**`);
    lines.push("");
    lines.push(`**Scenario:** ${c.testScenario}`);
    lines.push("");
    lines.push(`**Steps:**`);
    lines.push(c.steps);
    lines.push("");
    lines.push(`**Baseline (automation / notes):**`);
    lines.push(c.actualResult);
    lines.push("");
    lines.push(`**Expected result:**`);
    lines.push(c.expectedResult);
    lines.push("");
  }
}

const MAX_DESC = 100_000;

function truncate(text: string): string {
  if (text.length <= MAX_DESC) return text;
  return `${text.slice(0, MAX_DESC)}\n\n…(truncated for Jira description limit)`;
}

/** Summary for one Test issue containing N selected cases. */
export function buildTestSuiteSummary(scannedUrl: string, cases: ManualTestCase[]): string {
  const host = hostnameFromUrl(scannedUrl);
  if (cases.length === 0) return `[A11y Test] Manual suite · ${host}`.slice(0, 240);
  if (cases.length === 1) {
    const t = cases[0]!.testCaseTitle.trim();
    return `[A11y Test] ${t} · ${host}`.slice(0, 240);
  }
  const first = cases[0]!.testCaseTitle.trim().slice(0, 80);
  return `[A11y Test] Suite: ${first} (+${cases.length - 1} more) · ${host}`.slice(0, 240);
}

export function parseJiraTestTool(raw: string | undefined | null): JiraTestToolFormat {
  const v = raw?.trim().toLowerCase();
  if (v === "xray") return "xray";
  if (v === "zephyr") return "zephyr";
  return "generic";
}
