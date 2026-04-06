"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ScanIssue } from "@/lib/axeScanner";

export type ScanActivity = {
  inProgress: boolean;
  /** URL currently being scanned (for dashboard “scanning” row). */
  pendingUrl: string | null;
};

export type ScanSessionState = {
  scannedUrl: string | null;
  issues: ScanIssue[];
  setScanResults: (url: string, list: ScanIssue[]) => void;
  clearScan: () => void;
  scanActivity: ScanActivity;
  setScanActivity: (next: Partial<ScanActivity>) => void;
};

const ScanSessionContext = createContext<ScanSessionState | null>(null);

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [scanActivity, setScanActivityState] = useState<ScanActivity>({
    inProgress: false,
    pendingUrl: null,
  });

  const setScanResults = useCallback((url: string, list: ScanIssue[]) => {
    setScannedUrl(url);
    setIssues(list);
  }, []);

  const clearScan = useCallback(() => {
    setScannedUrl(null);
    setIssues([]);
  }, []);

  const setScanActivity = useCallback((next: Partial<ScanActivity>) => {
    setScanActivityState((prev) => ({ ...prev, ...next }));
  }, []);

  const value = useMemo(
    (): ScanSessionState => ({
      scannedUrl,
      issues,
      setScanResults,
      clearScan,
      scanActivity,
      setScanActivity,
    }),
    [scannedUrl, issues, setScanResults, clearScan, scanActivity, setScanActivity],
  );

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>;
}

export function useScanSession(): ScanSessionState {
  const ctx = useContext(ScanSessionContext);
  if (!ctx) {
    throw new Error("useScanSession must be used within ScanSessionProvider");
  }
  return ctx;
}
