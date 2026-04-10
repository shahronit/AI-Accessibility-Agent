import { NextRequest, NextResponse } from "next/server";
import type { ManualTestCase } from "@/lib/manualTestScenario";
import { plainTextToAdf } from "@/lib/jiraAdf";
import {
  buildTestPlanDescription,
  buildTestSuiteSummary,
  parseJiraTestTool,
  type JiraTestToolFormat,
} from "@/lib/jiraTestPlanDescription";

export const runtime = "nodejs";

function jiraConfigured(): boolean {
  return Boolean(
    process.env.JIRA_HOST?.trim() &&
      process.env.JIRA_EMAIL?.trim() &&
      process.env.JIRA_API_TOKEN?.trim() &&
      process.env.JIRA_PROJECT_KEY?.trim(),
  );
}

function normalizeHost(raw: string): string {
  let h = raw.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(h)) {
    h = `https://${h}`;
  }
  return h;
}

function isCase(v: unknown): v is ManualTestCase {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.testScenario === "string" &&
    typeof o.testCaseTitle === "string" &&
    typeof o.steps === "string" &&
    typeof o.actualResult === "string" &&
    typeof o.expectedResult === "string"
  );
}

function testIssueTypeName(): string {
  return process.env.JIRA_TEST_ISSUE_TYPE?.trim() || "Test";
}

function defaultTestToolFromEnv(): JiraTestToolFormat {
  return parseJiraTestTool(process.env.JIRA_TEST_TOOL);
}

/** Optional JSON merged into Jira `fields` (custom fields for Xray/Zephyr). */
function extraFieldsFromEnv(): Record<string, unknown> {
  const raw = process.env.JIRA_TEST_PLAN_EXTRA_FIELDS?.trim();
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return o as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      scannedUrl?: unknown;
      testCases?: unknown;
      testTool?: unknown;
    };

    if (typeof body.scannedUrl !== "string" || !body.scannedUrl.trim()) {
      return NextResponse.json({ error: "Invalid or missing scannedUrl." }, { status: 400 });
    }

    if (!Array.isArray(body.testCases) || body.testCases.length === 0) {
      return NextResponse.json({ error: "testCases must be a non-empty array." }, { status: 400 });
    }

    if (!body.testCases.every(isCase)) {
      return NextResponse.json({ error: "Invalid test case object." }, { status: 400 });
    }

    const cases = body.testCases as ManualTestCase[];
    const url = body.scannedUrl.trim();

    const toolFromBody =
      typeof body.testTool === "string" ? parseJiraTestTool(body.testTool) : defaultTestToolFromEnv();

    const summary = buildTestSuiteSummary(url, cases);
    const descriptionText = buildTestPlanDescription(url, cases, toolFromBody);
    const issueTypeName = testIssueTypeName();
    const extra = extraFieldsFromEnv();

    if (!jiraConfigured()) {
      if (process.env.NODE_ENV === "development") {
        console.info(
          "[jira-test-plan] mock",
          JSON.stringify(
            {
              summary,
              issueType: issueTypeName,
              testTool: toolFromBody,
              cases: cases.length,
              extraFieldKeys: Object.keys(extra),
            },
            null,
            2,
          ),
        );
      }
      return NextResponse.json({
        ok: true,
        mock: true,
        key: "MOCK-TEST",
        url: "https://example.atlassian.net/browse/MOCK-TEST",
        message:
          "Jira env not set — logged to server only. Set JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY. Use JIRA_TEST_ISSUE_TYPE=Test and optional JIRA_TEST_TOOL / JIRA_TEST_PLAN_EXTRA_FIELDS.",
      });
    }

    const hostBase = normalizeHost(process.env.JIRA_HOST!);
    const email = process.env.JIRA_EMAIL!.trim();
    const token = process.env.JIRA_API_TOKEN!.trim();
    const projectKey = process.env.JIRA_PROJECT_KEY!.trim();

    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      description: plainTextToAdf(descriptionText),
      issuetype: { name: issueTypeName },
      ...extra,
    };

    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const createUrl = `${hostBase}/rest/api/3/issue`;

    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    const data = (await res.json()) as {
      key?: string;
      errorMessages?: string[];
      errors?: Record<string, string>;
    };

    if (!res.ok) {
      const msg =
        data.errorMessages?.join("; ") ||
        Object.values(data.errors || {}).join("; ") ||
        `Jira API HTTP ${res.status}`;
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    const key = data.key ?? "UNKNOWN";
    const browse = `${hostBase}/browse/${key}`;
    return NextResponse.json({
      ok: true,
      mock: false,
      key,
      url: browse,
      message: `Created Test issue ${key} with ${cases.length} manual case(s) (${toolFromBody} layout). Issue type: ${issueTypeName}.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Jira request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
