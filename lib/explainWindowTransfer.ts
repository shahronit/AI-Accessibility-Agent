import type { ScanIssue } from "@/lib/axeScanner";

export const EXPLAIN_WINDOW_STORAGE_KEY = "a11y-explain-window-payload-v1";

/** Discard payloads older than this when opening the explain tab. */
export const EXPLAIN_PAYLOAD_MAX_AGE_MS = 15 * 60 * 1000;

export type ExplainWindowScanSummary = {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
};

export type ExplainWindowPayloadV1 = {
  v: 1;
  issuedAt: number;
  mode: "issue" | "chatOnly";
  scannedUrl: string | null;
  scanSummary: ExplainWindowScanSummary | null;
  issue: ScanIssue | null;
  prefillChat: string | null;
  /**
   * Fix 6 - pre-fetched explanation text for `mode === "issue"` payloads.
   * When present, the explain workspace skips the live `/api/ai-explain`
   * call and renders the cached text immediately. Always already
   * sanitised by the server before it lands here.
   */
  prefetchedExplanation?: string | null;
  /** Provider model id matching `prefetchedExplanation` (e.g. "claude-sonnet-4-5"). */
  prefetchedExplanationModel?: string | null;
};

function isScanIssue(value: unknown): value is ScanIssue {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const kindOk =
    o.kind === undefined || o.kind === "violation" || o.kind === "needs_review";
  return (
    kindOk &&
    typeof o.index === "number" &&
    typeof o.id === "string" &&
    typeof o.description === "string" &&
    typeof o.impact === "string" &&
    typeof o.html === "string" &&
    typeof o.helpUrl === "string"
  );
}

function normalizeScanSummary(value: unknown): ExplainWindowScanSummary | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (typeof s.total !== "number" || s.total <= 0) return null;
  if (!s.byImpact || typeof s.byImpact !== "object") return null;
  const topRules = Array.isArray(s.topRules)
    ? (s.topRules as { id?: string; count?: number }[])
        .filter((r) => typeof r?.id === "string" && typeof r?.count === "number")
        .map((r) => ({ id: r.id as string, count: r.count as number }))
    : [];
  return {
    scannedUrl: typeof s.scannedUrl === "string" ? s.scannedUrl : undefined,
    total: s.total,
    byImpact: s.byImpact as Record<string, number>,
    topRules,
  };
}

function parsePayload(raw: string): ExplainWindowPayloadV1 | null {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (o.v !== 1) return null;
    const issuedAt = typeof o.issuedAt === "number" ? o.issuedAt : 0;
    if (!issuedAt || Date.now() - issuedAt > EXPLAIN_PAYLOAD_MAX_AGE_MS) return null;
    const mode = o.mode === "chatOnly" ? "chatOnly" : o.mode === "issue" ? "issue" : null;
    if (!mode) return null;
    const scannedUrl = typeof o.scannedUrl === "string" ? o.scannedUrl : null;
    const scanSummary = normalizeScanSummary(o.scanSummary);
    const issue = o.issue != null && isScanIssue(o.issue) ? o.issue : null;
    const prefillChat = typeof o.prefillChat === "string" ? o.prefillChat : null;
    const prefetchedExplanation =
      typeof o.prefetchedExplanation === "string" && o.prefetchedExplanation.length > 0
        ? o.prefetchedExplanation
        : null;
    const prefetchedExplanationModel =
      typeof o.prefetchedExplanationModel === "string" && o.prefetchedExplanationModel.length > 0
        ? o.prefetchedExplanationModel
        : null;
    if (mode === "issue" && !issue) return null;
    if (mode === "chatOnly" && (!scanSummary || scanSummary.total <= 0)) return null;
    return {
      v: 1,
      issuedAt,
      mode,
      scannedUrl,
      scanSummary,
      issue,
      prefillChat,
      prefetchedExplanation,
      prefetchedExplanationModel,
    };
  } catch {
    return null;
  }
}

export function writeExplainWindowPayload(input: {
  mode: "issue" | "chatOnly";
  scannedUrl: string | null;
  scanSummary: ExplainWindowScanSummary | null;
  issue: ScanIssue | null;
  prefillChat?: string | null;
  prefetchedExplanation?: string | null;
  prefetchedExplanationModel?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const payload: ExplainWindowPayloadV1 = {
    v: 1,
    issuedAt: Date.now(),
    mode: input.mode,
    scannedUrl: input.scannedUrl,
    scanSummary: input.scanSummary,
    issue: input.issue,
    prefillChat: input.prefillChat ?? null,
    prefetchedExplanation: input.prefetchedExplanation ?? null,
    prefetchedExplanationModel: input.prefetchedExplanationModel ?? null,
  };
  try {
    localStorage.setItem(EXPLAIN_WINDOW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode */
  }
}

/** Read payload once and remove it from storage so reload does not repeat. */
export function readAndConsumeExplainWindowPayload(): ExplainWindowPayloadV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EXPLAIN_WINDOW_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(EXPLAIN_WINDOW_STORAGE_KEY);
    return parsePayload(raw);
  } catch {
    return null;
  }
}

export function openScanExplainTab(): Window | null {
  if (typeof window === "undefined") return null;
  return window.open("/scan/explain", "_blank", "noopener,noreferrer");
}
