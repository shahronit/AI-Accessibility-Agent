import { NextRequest, NextResponse } from "next/server";

/**
 * Mock Jira ticket creation — logs payload server-side for demos.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.info("[jira-mock] ticket payload", JSON.stringify(body, null, 2));
    return NextResponse.json({
      ok: true,
      key: "MOCK-42",
      url: "https://example.atlassian.net/browse/MOCK-42",
      message: "Mock ticket recorded (see server logs).",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
