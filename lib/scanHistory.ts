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
  /** Trimmed snapshot for quick restore */
  issuesSample?: Pick<ScanIssue, "id" | "impact" | "description">[];
};

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
