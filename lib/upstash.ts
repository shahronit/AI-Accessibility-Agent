import { Redis } from "@upstash/redis";

/**
 * Single shared Upstash Redis client for everything that needs Redis on the
 * server (per-IP rate limiting in `lib/rateLimit.ts`, the scan store /
 * diff layer in `lib/scan-store.ts`, future Fix 6 caching, etc.).
 *
 * Why a module-local cache instead of `globalThis`: route handlers run in a
 * single Node process per cold start; the module is evaluated once and
 * shared across requests. The Upstash REST client is HTTP-based and stateless
 * so re-creating it would be cheap, but reusing one instance keeps the
 * "missing env vars" warning to a single line and makes the `null` semantics
 * deterministic (one factory, one decision).
 *
 * Local dev (UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN unset):
 * a single warning is logged and `getRedis()` returns `null`. Callers must
 * branch on `null` to skip Redis-dependent work without breaking dev.
 */

let cachedRedis: Redis | null = null;
let warnedMissingEnv = false;
let testOverride: Redis | null = null;

export function getRedis(): Redis | null {
  // Test seam (see `scripts/smoke-fix*.ts`): when a test has injected an
  // in-memory stub via `__setRedisForTests`, prefer it over both the cached
  // client and env-var resolution. Production code never touches this path.
  if (testOverride) return testOverride;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true;
      console.warn(
        "[upstash] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; Redis-backed features (rate limiting, scan diffing) are disabled.",
      );
    }
    return null;
  }

  if (!cachedRedis) {
    cachedRedis = new Redis({ url, token });
  }
  return cachedRedis;
}

/**
 * Test-only injection point. Pass an object that implements the subset of
 * the Upstash `Redis` API used by `lib/scan-store.ts` and friends. Pass
 * `null` to clear the override. Production code never calls this.
 */
export function __setRedisForTests(redis: unknown | null): void {
  testOverride = (redis as Redis | null) ?? null;
}
