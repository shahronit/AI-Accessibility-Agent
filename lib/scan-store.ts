import crypto from "node:crypto";
import { getRedis } from "@/lib/upstash";
import {
  type ScanIssue,
  type AxeOverviewStats,
  issueDedupKey,
  summarizeIssues,
} from "@/lib/axeScanner";
import type { WcagPresetId } from "@/lib/wcagAxeTags";

/**
 * URL-keyed scan persistence + diffing layer (Fix 5).
 *
 * Why a second store on top of the existing SQLite history (`lib/db.ts`):
 *  - SQLite rows are per-user and live behind login. They power the personal
 *    "/history" dashboard.
 *  - This KV store is per-URL (no auth required) so re-scans of the same
 *    page surface a "vs. last scan: +N new, -M resolved" badge regardless of
 *    who triggered the scan, and so future Fixes (caching, public history)
 *    have a single source of truth keyed on URL hash.
 *
 * Backend: shared `getRedis()` (Upstash Redis, see `lib/upstash.ts`). When
 * Upstash env vars are missing the helper logs once and returns null; every
 * exported function in this module then no-ops or returns `null`/`[]` so the
 * scan pipeline keeps working in dev without Redis.
 *
 * Key layout:
 *   scan:id:{scanId}                -> JSON, EX 30d
 *   scan:url:{urlHash}:latest       -> scanId (string), no TTL
 *   scan:url:{urlHash}:history      -> Redis list of scanIds (LPUSH then LTRIM 0 9)
 */

const SCAN_TTL_SECONDS = 60 * 60 * 24 * 30;
const HISTORY_LIMIT = 10;
/**
 * Fix 7 - Global cross-URL recency index used by `/api/scan-history` and the
 * `/history` dashboard. Capped at 500 entries; older scan IDs roll off the
 * list (their `scan:id:{id}` body still lives until the 30 day TTL).
 */
const GLOBAL_HISTORY_KEY = "scan:global:history";
const GLOBAL_HISTORY_LIMIT = 500;
/** Cache freshness window for the Fix 6 fast-path on `/api/scan`. */
export const SCAN_CACHE_TTL_SECONDS = 600;
/** Hard ceiling for cache reads to honour the 500 ms Vercel SLO from the brief. */
export const SCAN_CACHE_READ_TIMEOUT_MS = 500;

export type ScanEngineStatus = {
  ran: boolean;
  durationMs: number;
  issueCount: number;
  error?: string;
};

export type StoredScanResult = {
  scanId: string;
  url: string;
  scannedAt: string;
  wcagPreset: WcagPresetId;
  issues: ScanIssue[];
  reviewIssues: ScanIssue[];
  summary: ReturnType<typeof summarizeIssues>;
  axeOverview: AxeOverviewStats | null;
  sources: { axe: boolean; ibm: boolean };
};

export type ScanDiff = {
  newIssues: ScanIssue[];
  resolvedIssues: ScanIssue[];
  unchanged: ScanIssue[];
  summary: { added: number; resolved: number; unchanged: number };
};

/**
 * Normalise the URL before hashing so trivially different inputs
 * (`HTTPS://Example.com/foo/`, `https://example.com/foo`) collapse to one key.
 * Falls back to the raw input on parse failures so we never crash mid-scan.
 */
function normaliseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return raw.trim();
  }
}

function urlHash(rawUrl: string): string {
  const canonical = normaliseUrl(rawUrl);
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function scanIdKey(scanId: string): string {
  return `scan:id:${scanId}`;
}
function latestKey(rawUrl: string): string {
  return `scan:url:${urlHash(rawUrl)}:latest`;
}
function historyKey(rawUrl: string): string {
  return `scan:url:${urlHash(rawUrl)}:history`;
}

/**
 * Cache key keyed on URL + a hash of the scan-shaping options so that
 * different presets (deep scan vs quick, wcag22-aa vs wcag20-a, login vs
 * anon) never collide. Uses sha256 per the brief and truncates to 16 chars
 * for short, readable keys.
 */
export function scanCacheKey(rawUrl: string, options: Record<string, unknown>): string {
  const optsHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(options))
    .digest("hex")
    .slice(0, 16);
  return `scan:cache:${urlHash(rawUrl)}:${optsHash}`;
}

/**
 * Upstash sometimes returns parsed JSON for stored objects and a raw string
 * other times depending on how the record was written. Handle both shapes
 * defensively so a redeploy with a slightly different SDK can't poison the
 * diff endpoint.
 */
function decodeStoredScan(raw: unknown): StoredScanResult | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StoredScanResult;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as StoredScanResult;
  return null;
}

export async function saveScan(result: StoredScanResult): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  const id = result.scanId;
  try {
    await redis.set(scanIdKey(id), JSON.stringify(result), { ex: SCAN_TTL_SECONDS });
    await redis.set(latestKey(result.url), id);
    await redis.lpush(historyKey(result.url), id);
    await redis.ltrim(historyKey(result.url), 0, HISTORY_LIMIT - 1);
    // Fix 7 - keep a cross-URL recency index so `/history` can paginate
    // across all scans without scanning every URL bucket.
    await redis.lpush(GLOBAL_HISTORY_KEY, id);
    await redis.ltrim(GLOBAL_HISTORY_KEY, 0, GLOBAL_HISTORY_LIMIT - 1);
    return id;
  } catch (e) {
    console.error("[scan-store] saveScan failed:", e);
    return null;
  }
}

export async function getScan(scanId: string): Promise<StoredScanResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(scanIdKey(scanId));
    return decodeStoredScan(raw);
  } catch (e) {
    console.error("[scan-store] getScan failed:", e);
    return null;
  }
}

export async function getLatestScan(url: string): Promise<StoredScanResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const id = await redis.get<string>(latestKey(url));
    if (!id) return null;
    return getScan(id);
  } catch (e) {
    console.error("[scan-store] getLatestScan failed:", e);
    return null;
  }
}

/**
 * Returns the second-most-recent scan for the URL (i.e. the baseline we diff
 * against). Returns null if fewer than two scans exist.
 */
export async function getPreviousScan(url: string): Promise<StoredScanResult | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const ids = (await redis.lrange<string>(historyKey(url), 0, 1)) ?? [];
    if (ids.length < 2) return null;
    return getScan(ids[1]!);
  } catch (e) {
    console.error("[scan-store] getPreviousScan failed:", e);
    return null;
  }
}

/** Fix 7 - alias kept stable so route handlers don't depend on internal name. */
export const getScanById = getScan;

/**
 * Compact projection used by `/api/scan-history` and the `/history` dashboard.
 * Severity counts come straight from `summarizeIssues` so the dashboard can
 * render dot rows without reading every issue.
 */
export type HistoryScan = {
  id: string;
  url: string;
  scannedAt: string;
  wcagPreset: WcagPresetId;
  issueCount: number;
  reviewCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  /** Optional diff against the immediately prior scan for this URL. */
  diffVsPrevious?: { added: number; resolved: number };
};

function projectHistoryScan(scan: StoredScanResult): HistoryScan {
  const by = scan.summary?.byImpact ?? {};
  const num = (k: string): number => {
    const v = (by as Record<string, unknown>)[k];
    return typeof v === "number" ? v : 0;
  };
  return {
    id: scan.scanId,
    url: scan.url,
    scannedAt: scan.scannedAt,
    wcagPreset: scan.wcagPreset,
    issueCount: scan.issues?.length ?? 0,
    reviewCount: scan.reviewIssues?.length ?? 0,
    criticalCount: num("critical"),
    seriousCount: num("serious"),
    moderateCount: num("moderate"),
    minorCount: num("minor"),
  };
}

export type ListScansOptions = {
  /** Page size, clamped to 1..100 by the caller. */
  limit: number;
  /** 0-based offset into the global history list. */
  offset: number;
};

export type ListScansResult = {
  scans: HistoryScan[];
  /** `LLEN` of the global history index - upper bound on what can be paged. */
  total: number;
};

/**
 * Paginated, recency-ordered listing of scans across all URLs (Fix 7). Each
 * page resolves N scan IDs from the global index and `MGET`s their bodies.
 * Bodies that have aged out of the 30-day TTL are filtered out (their ID
 * stays in the index until it falls off via LTRIM, which keeps writes O(1)).
 *
 * `diffVsPrevious` is computed by comparing against the previous scan for
 * the same URL when one exists in this same page; cross-page diffs would
 * require a second round-trip per row, which is too chatty for the listing.
 */
export async function listScans({ limit, offset }: ListScansOptions): Promise<ListScansResult> {
  const redis = getRedis();
  if (!redis) return { scans: [], total: 0 };
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  try {
    const total = (await redis.llen(GLOBAL_HISTORY_KEY)) ?? 0;
    if (total === 0) return { scans: [], total: 0 };
    const ids =
      (await redis.lrange<string>(
        GLOBAL_HISTORY_KEY,
        safeOffset,
        safeOffset + safeLimit - 1,
      )) ?? [];
    if (ids.length === 0) return { scans: [], total };

    // `mget` preserves order and returns `null` for missing keys.
    const raws = (await redis.mget<unknown[]>(...ids.map(scanIdKey))) ?? [];
    const stored: StoredScanResult[] = [];
    raws.forEach((raw) => {
      const decoded = decodeStoredScan(raw);
      if (decoded) stored.push(decoded);
    });

    // Pre-compute a per-URL "previous scan" view so we can show a delta on
    // the current page without an extra Redis hop for every row. Adjacent
    // duplicates of the same URL are common in dev when hammering re-scan.
    const seenByUrl = new Map<string, StoredScanResult[]>();
    for (const s of stored) {
      const arr = seenByUrl.get(s.url) ?? [];
      arr.push(s);
      seenByUrl.set(s.url, arr);
    }
    const prevByScanId = new Map<string, StoredScanResult>();
    for (const arr of seenByUrl.values()) {
      // arr is in recency order (newest first because LRANGE follows LPUSH);
      // pair each entry with the next one in the array.
      for (let i = 0; i < arr.length - 1; i++) {
        const cur = arr[i]!;
        const prev = arr[i + 1]!;
        prevByScanId.set(cur.scanId, prev);
      }
    }

    const scans: HistoryScan[] = stored.map((s) => {
      const projection = projectHistoryScan(s);
      const prev = prevByScanId.get(s.scanId);
      if (prev) {
        const d = diffScans(prev, s);
        projection.diffVsPrevious = {
          added: d.summary.added,
          resolved: d.summary.resolved,
        };
      }
      return projection;
    });

    return { scans, total };
  } catch (e) {
    console.error("[scan-store] listScans failed:", e);
    return { scans: [], total: 0 };
  }
}

export async function listHistory(url: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    return (await redis.lrange<string>(historyKey(url), 0, HISTORY_LIMIT - 1)) ?? [];
  } catch (e) {
    console.error("[scan-store] listHistory failed:", e);
    return [];
  }
}

/**
 * Race a Redis read against a hard timeout. Vercel functions can stall on
 * Upstash hiccups; the brief mandates that a slow cache lookup must not
 * delay an otherwise-functional scan, so we always return the loser.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

export type CachedScanEntry = {
  /** The merged scan response payload (whatever the route returns). */
  payload: unknown;
  /** Epoch ms when the cache entry was written. */
  cachedAt: number;
};

/**
 * Fetch a cached scan body for (url, options). Returns `null` on cache miss,
 * Upstash outage, or read timeout (>= SCAN_CACHE_READ_TIMEOUT_MS) so the
 * caller can fall through to a real scan.
 */
export async function getCachedScan(
  url: string,
  options: Record<string, unknown>,
): Promise<CachedScanEntry | null> {
  const redis = getRedis();
  if (!redis) return null;
  const key = scanCacheKey(url, options);
  const result = await withTimeout(redis.get(key), SCAN_CACHE_READ_TIMEOUT_MS);
  if (!result) return null;
  // Upstash deserialises JSON for us when the value was set with an object,
  // and returns the raw string when it was set as a string. Handle both.
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as CachedScanEntry;
    } catch {
      return null;
    }
  }
  if (typeof result === "object") return result as CachedScanEntry;
  return null;
}

/**
 * Cache a scan body keyed on (url, options) with a 10-minute TTL. Failures
 * are logged but never thrown — the live scan path is the source of truth.
 */
export async function setCachedScan(
  url: string,
  options: Record<string, unknown>,
  payload: unknown,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = scanCacheKey(url, options);
  const entry: CachedScanEntry = { payload, cachedAt: Date.now() };
  try {
    await redis.set(key, JSON.stringify(entry), { ex: SCAN_CACHE_TTL_SECONDS });
  } catch (e) {
    console.error("[scan-store] setCachedScan failed:", e);
  }
}

/**
 * Pure function (no I/O) so callers can diff arbitrary stored scans. Uses
 * the same `issueDedupKey` as `mergeFindings` so a finding that survives
 * across runs maps to the same key in both axe and IBM.
 */
export function diffScans(baseline: StoredScanResult, latest: StoredScanResult): ScanDiff {
  const baselineMap = new Map<string, ScanIssue>();
  for (const issue of baseline.issues) baselineMap.set(issueDedupKey(issue), issue);

  const newIssues: ScanIssue[] = [];
  const unchanged: ScanIssue[] = [];
  const seenInLatest = new Set<string>();

  for (const issue of latest.issues) {
    const key = issueDedupKey(issue);
    seenInLatest.add(key);
    if (baselineMap.has(key)) {
      unchanged.push(issue);
    } else {
      newIssues.push(issue);
    }
  }

  const resolvedIssues: ScanIssue[] = [];
  for (const [key, issue] of baselineMap) {
    if (!seenInLatest.has(key)) resolvedIssues.push(issue);
  }

  return {
    newIssues,
    resolvedIssues,
    unchanged,
    summary: {
      added: newIssues.length,
      resolved: resolvedIssues.length,
      unchanged: unchanged.length,
    },
  };
}
