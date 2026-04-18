import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listScans } from "@/lib/scan-store";

export const runtime = "nodejs";

/**
 * Fix 7 - paginated, recency-ordered scan history backed by the Upstash
 * `scan:global:history` index. Auth-gated: the listing exposes URLs that
 * may include query params and slugs that other users scanned, so it
 * should not be publicly readable. Pagination params are clamped server
 * side so a malicious caller cannot ask for a million-row page.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit") ?? "20");
  const rawOffset = Number(params.get("offset") ?? "0");
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;

  const { scans, total } = await listScans({ limit, offset });

  return NextResponse.json({ scans, total, limit, offset });
}
