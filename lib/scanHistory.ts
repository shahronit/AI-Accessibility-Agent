"use client";

import type { ScanIssue } from "@/lib/axeScanner";

const STORAGE_KEY = "a11y-scan-history-v1";
const MAX_ENTRIES = 20;

export type HistoryEntry = {
  id: string;
  scannedUrl: string;
  savedAt: string;
  totalIssues: number;
  byImpact: Record<string, number>;
  /** Axe incomplete instances (potential / needs manual review), when the scan requested overview stats */
  incompleteInstances?: number;
  /** Trimmed snapshot for quick restore */
  issuesSample?: Pick<ScanIssue, "id" | "impact" | "description">[];
  /** Capped full findings for dashboard report (see MAX_ISSUES_IN_HISTORY). */
  issues?: ScanIssue[];
  /** axe incomplete / needs-review instances (capped). */
  reviewIssues?: ScanIssue[];
  totalReviewIssues?: number;
};

/** Max issues stored in history for the /report view (localStorage size). */
export const MAX_ISSUES_IN_HISTORY = 50;

function readAll(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function loadScanHistory(): HistoryEntry[] {
  return readAll();
}

export function saveScanToHistory(entry: Omit<HistoryEntry, "id" | "savedAt"> & { id?: string; savedAt?: string }) {
  const id = entry.id ?? crypto.randomUUID();
  const savedAt = entry.savedAt ?? new Date().toISOString();
  const full: HistoryEntry = { ...entry, id, savedAt };
  const next = [full, ...readAll().filter((e) => e.scannedUrl !== full.scannedUrl || e.savedAt !== full.savedAt)].slice(
    0,
    MAX_ENTRIES,
  );
  writeAll(next);
}

export function clearScanHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Compare two scanned URLs for dashboard matching (same page, ignoring trailing slash).
 */
export function dashboardScanUrlKey(href: string): string {
  const t = href.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    u.hash = "";
    const path = u.pathname.replace(/\/$/, "") || "/";
    return `${u.origin.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return t.replace(/\/$/, "").toLowerCase();
  }
}

/** Latest saved entry for the same page URL (normalized), or undefined. */
export function findLatestHistoryForUrl(href: string): HistoryEntry | undefined {
  const key = dashboardScanUrlKey(href);
  if (!key) return undefined;
  return loadScanHistory().find((e) => dashboardScanUrlKey(e.scannedUrl) === key);
}
