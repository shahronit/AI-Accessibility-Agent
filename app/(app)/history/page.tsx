"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Download, ExternalLink, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth, authHeaders } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearScanHistory, loadScanHistory, type HistoryEntry } from "@/lib/scanHistory";

function formatWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface DbScanEntry {
  id: string;
  url: string;
  status: string;
  overall_score: number | null;
  total_violations: number;
  started_at: string;
}

export default function HistoryPage() {
  const { user, token } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [dbScans, setDbScans] = useState<DbScanEntry[]>([]);

  const refresh = useCallback(() => {
    setEntries(loadScanHistory());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from localStorage after mount
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) { setDbScans([]); return; }
    fetch("/api/dashboard/history?limit=50", { headers: authHeaders(token) })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.scans) setDbScans(data.scans); })
      .catch(() => {});
  }, [token]);

  const handleClear = () => {
    clearScanHistory();
    refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Card className="agent-card">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Saved scans</CardTitle>
            <CardDescription>
              Websites you scanned on this device. Open one in the scanner anytime to run a new check.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={entries.length === 0}
            onClick={handleClear}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear history
          </Button>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No history yet. Run a scan from the Scan page.</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => {
                const openHref = `/scan?url=${encodeURIComponent(e.scannedUrl)}`;
                return (
                  <li
                    key={e.id}
                    className="border-border/60 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <a
                        href={e.scannedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex max-w-full items-center gap-1 font-medium break-all underline-offset-2 hover:underline"
                      >
                        {e.scannedUrl}
                        <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      </a>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3.5" aria-hidden />
                          {formatWhen(e.savedAt)}
                        </span>
                        <span>
                          {e.totalIssues} issues · critical {e.byImpact.critical ?? 0}, serious{" "}
                          {e.byImpact.serious ?? 0}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={openHref}
                      className={cn(buttonVariants({ variant: "default", size: "sm" }), "shrink-0 gap-1.5")}
                    >
                      Open in scanner
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {user && dbScans.length > 0 && (
        <Card className="agent-card">
          <CardHeader>
            <CardTitle className="text-lg">Server-backed scans</CardTitle>
            <CardDescription>
              Multi-page scans saved to your account with full reports and PDF/CSV export.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {dbScans.map((s) => (
                <li
                  key={s.id}
                  className="border-border/60 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-primary font-medium break-all">{s.url}</p>
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5" aria-hidden />
                        {formatWhen(s.started_at)}
                      </span>
                      <span className="capitalize">{s.status}</span>
                      {s.overall_score != null && (
                        <span>Score: {s.overall_score}</span>
                      )}
                      <span>{s.total_violations} violations</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {s.status === "completed" && (
                      <Link
                        href={`/report?url=${encodeURIComponent(s.url)}&scanId=${s.id}`}
                        className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
                      >
                        View report
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    )}
                    {s.status === "completed" && token && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch(`/api/reports/${s.id}/pdf`, {
                            headers: authHeaders(token),
                          });
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `a11y-report-${s.id.slice(0, 8)}.pdf`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 60000);
                        }}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                      >
                        <Download className="size-3.5" aria-hidden />
                        PDF
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
