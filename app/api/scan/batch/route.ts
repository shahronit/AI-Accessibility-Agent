import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createScan } from "@/lib/db";
import { validateScanUrl } from "@/lib/url";
import { parseWcagPreset, type WcagPresetId } from "@/lib/wcagAxeTags";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";

const MAX_BATCH = 10;

export async function POST(req: NextRequest) {
  try {
    const rateLimited = checkRateLimit(req, RATE_LIMITS.scan);
    if (rateLimited) return rateLimited;

    let user;
    try {
      user = requireAuth(req);
    } catch {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { urls, wcagPreset: rawPreset } = body as {
      urls?: unknown;
      wcagPreset?: unknown;
    };

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: "urls must be a non-empty array" }, { status: 400 });
    }
    if (urls.length > MAX_BATCH) {
      return NextResponse.json({ error: `Maximum ${MAX_BATCH} URLs per batch` }, { status: 400 });
    }

    const wcagPreset: WcagPresetId = parseWcagPreset(rawPreset);

    const results: { url: string; scanId?: string; error?: string }[] = [];

    for (const rawUrl of urls) {
      if (typeof rawUrl !== "string") {
        results.push({ url: String(rawUrl), error: "Invalid URL" });
        continue;
      }
      const validation = validateScanUrl(rawUrl);
      if (!validation.ok) {
        results.push({ url: rawUrl, error: validation.error });
        continue;
      }
      const scan = createScan(user.id, validation.url, wcagPreset, 1);
      results.push({ url: validation.url, scanId: scan.id });
    }

    return NextResponse.json({ results }, { status: 202 });
  } catch (err) {
    console.error("Batch scan error:", err);
    return NextResponse.json({ error: "Batch scan failed" }, { status: 500 });
  }
}
