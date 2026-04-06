import { NextRequest, NextResponse } from "next/server";
import { plainTextToAdf } from "@/lib/jiraAdf";

export const runtime = "nodejs";

type Body = {
  summary?: string;
  description?: string;
  url?: string;
  impact?: string;
  html?: string;
  issueIndex?: number;
  helpUrl?: string;
  sourceUrl?: string;
};

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

function buildDescriptionText(b: Body): string {
  const parts = [
    b.description?.trim() || "",
    "",
    `**Page URL:** ${b.url ?? "(unknown)"}`,
    b.sourceUrl && b.sourceUrl !== b.url ? `**Finding URL:** ${b.sourceUrl}` : "",
    `**Impact:** ${b.impact ?? "unknown"}`,
    typeof b.issueIndex === "number" ? `**Issue #:** ${b.issueIndex}` : "",
    b.helpUrl ? `**WCAG help:** ${b.helpUrl}` : "",
    b.html ? `\n**Sample HTML:**\n\`\`\`html\n${b.html.slice(0, 6000)}\n\`\`\`` : "",
  ];
  return parts.filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const summaryRaw = typeof body.summary === "string" ? body.summary.trim() : "";
    const summary = summaryRaw.slice(0, 240) || "[A11y] Accessibility defect";
    const descriptionText = buildDescriptionText(body);

    if (!jiraConfigured()) {
      console.info("[jira-issue] mock (env not set)", JSON.stringify({ summary, url: body.url }, null, 2));
      return NextResponse.json({
        ok: true,
        mock: true,
        key: "MOCK-42",
        url: "https://example.atlassian.net/browse/MOCK-42",
        message:
          "Jira env vars not set — logged to server only. Set JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY for real tickets.",
      });
    }

    const host = normalizeHost(process.env.JIRA_HOST!);
    const email = process.env.JIRA_EMAIL!.trim();
    const token = process.env.JIRA_API_TOKEN!.trim();
    const projectKey = process.env.JIRA_PROJECT_KEY!.trim();
    const issueType = process.env.JIRA_ISSUE_TYPE?.trim() || "Task";

    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const createUrl = `${host}/rest/api/3/issue`;

    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary,
          description: plainTextToAdf(descriptionText),
          issuetype: { name: issueType },
        },
      }),
    });

    const data = (await res.json()) as {
      id?: string;
      key?: string;
      self?: string;
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
    const browse = `${host}/browse/${key}`;
    return NextResponse.json({
      ok: true,
      mock: false,
      key,
      url: browse,
      message: `Created ${key}`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Jira request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
