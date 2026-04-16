import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitConfig {
  /** Unique namespace for this limiter (e.g. "scan", "auth") */
  prefix: string;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
}

export const RATE_LIMITS = {
  general: { prefix: "gen", windowMs: 15 * 60_000, max: 100 } satisfies RateLimitConfig,
  scan: { prefix: "scan", windowMs: 15 * 60_000, max: 5 } satisfies RateLimitConfig,
  auth: { prefix: "auth", windowMs: 15 * 60_000, max: 20 } satisfies RateLimitConfig,
} as const;

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Check rate limit. Returns null if allowed, or a NextResponse 429 if exceeded.
 */
export function checkRateLimit(
  request: Request,
  config: RateLimitConfig,
): NextResponse | null {
  cleanup();

  const ip = getClientKey(request);
  const key = `${config.prefix}:${ip}`;
  const now = Date.now();

  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > config.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  return null;
}
