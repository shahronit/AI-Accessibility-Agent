import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertSafeUrl, SsrfError } from "@/lib/ssrf-guard";
import { diffScans, getLatestScan, getPreviousScan } from "@/lib/scan-store";

export const runtime = "nodejs";

/**
 * GET /api/scan-diff?url=<targetUrl>
 *
 * Returns the latest stored scan for the URL plus a diff against the
 * second-most-recent scan. Always 200 when the URL is valid:
 *  - No scans recorded yet: `{ latest: null, baseline: null, diff: null }`.
 *  - Only one scan recorded: `{ latest, baseline: null, diff: null }`.
 *  - Two+ scans: `{ latest, baseline, diff }` with `summary.added/resolved/unchanged`.
 *
 * Auth-gated to mirror the existing scan-related routes; SSRF-validated to
 * prevent internal hostnames being probed via the diff key (the URL is
 * normalised the same way `saveScan` normalises before hashing).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url") ?? "";
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing required query parameter `url`." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = await assertSafeUrl(rawUrl);
  } catch (e) {
    if (e instanceof SsrfError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  const targetUrl = parsedUrl.toString();

  const [latest, baseline] = await Promise.all([
    getLatestScan(targetUrl),
    getPreviousScan(targetUrl),
  ]);

  const diff = latest && baseline ? diffScans(baseline, latest) : null;

  return NextResponse.json({ latest, baseline, diff });
}
