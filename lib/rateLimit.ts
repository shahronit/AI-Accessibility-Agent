import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { getRedis } from "@/lib/upstash";

/**
 * Per-IP sliding-window rate limiting backed by Upstash Redis.
 *
 * Tiers (per IP, per rolling 1h window):
 *   - scanLimiter: 10/h  → /api/scan, /api/scan/batch
 *   - aiLimiter:   50/h  → /api/ai-explain, /api/ai-testing-analysis, /api/testing-scenarios
 *   - chatLimiter: 30/h  → /api/chat
 *
 * Local dev (UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN unset):
 * the shared `getRedis()` helper logs a single warning and returns null;
 * `enforceRateLimit` then returns null so requests pass through unmetered.
 * Production deploys (Vercel, Render, etc.) MUST set both env vars or rate
 * limiting is silently disabled.
 */

/**
 * Build a sliding-window limiter lazily. We can't construct `Ratelimit` at
 * module-load time because it needs a Redis instance, and Redis can't be built
 * without env vars (which may not exist in local dev). Each call returns either
 * a working `Ratelimit` or `null` when env vars are missing.
 */
function buildLimiter(prefix: string, max: number): () => Ratelimit | null {
  let cached: Ratelimit | null = null;
  return () => {
    if (cached) return cached;
    const redis = getRedis();
    if (!redis) return null;
    cached = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, "1 h"),
      prefix: `a11yagent:${prefix}`,
      analytics: false,
    });
    return cached;
  };
}

const scanLimiterFactory = buildLimiter("scan", 10);
const aiLimiterFactory = buildLimiter("ai", 50);
const chatLimiterFactory = buildLimiter("chat", 30);

export type LimiterId = "scan" | "ai" | "chat";

const factories: Record<LimiterId, () => Ratelimit | null> = {
  scan: scanLimiterFactory,
  ai: aiLimiterFactory,
  chat: chatLimiterFactory,
};

/** Public limiter handles consumed by API routes. */
export const scanLimiter: LimiterId = "scan";
export const aiLimiter: LimiterId = "ai";
export const chatLimiter: LimiterId = "chat";

/**
 * Extract a stable client identifier for rate-limit bucketing.
 * Order: x-forwarded-for (first hop) → x-real-ip → "anonymous".
 *
 * Note: in untrusted networks `x-forwarded-for` is spoofable. Vercel/Render
 * rewrite the header to the real client IP before our handler runs, so this
 * is safe in production.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anonymous";
}

/**
 * Run the rate-limit check at the top of an API handler.
 *
 * Returns `null` when the request is allowed (or when rate limiting is
 * disabled because env vars are unset). Returns a 429 `NextResponse` with
 * `Retry-After` header + `{ error, retryAfter }` body when the IP is over
 * its budget for the chosen limiter.
 */
export async function enforceRateLimit(
  req: Request,
  limiterId: LimiterId,
): Promise<NextResponse | null> {
  const limiter = factories[limiterId]();
  if (!limiter) return null;

  const ip = getClientIp(req);
  const result = await limiter.limit(ip);

  if (result.success) return null;

  const retryAfterMs = Math.max(0, result.reset - Date.now());
  const retryAfter = Math.ceil(retryAfterMs / 1000);

  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.reset / 1000)),
      },
    },
  );
}
