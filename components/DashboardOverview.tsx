"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Ear,
  Globe,
  Info,
  Loader2,
  Plus,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { dashboardScanUrlKey, type HistoryEntry } from "@/lib/scanHistory";
import type { ScanIssue } from "@/lib/axeScanner";

const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor"] as const;

/** Rows in Recent scans (excluding in-flight row). Full list lives on /history. */
const DASHBOARD_HISTORY_ROWS = 5;
const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  serious: "bg-orange-500",
  moderate: "bg-amber-400",
  minor: "bg-emerald-500",
  passed: "bg-teal-400",
};

function formatScanDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ViolationTrendChart({ counts }: { counts: number[] }) {
  const w = 320;
  const h = 140;
  const pad = 12;
  if (counts.length === 0) {
    return (
      <div className="bg-black/20 flex h-[140px] items-center justify-center rounded-xl border border-white/5 text-xs text-zinc-500">
        Run scans to see violation trend
      </div>
    );
  }
  const maxVal = Math.max(...counts, 1);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  if (counts.length === 1) {
    const v = counts[0];
    const x = w / 2;
    const y = pad + innerH - (v / maxVal) * innerH;
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[140px] w-full text-orange-400/90"
        aria-label="Violation count (single scan)"
      >
        <circle cx={x} cy={y} r={5} fill="currentColor" />
      </svg>
    );
  }

  const pts = counts.map((v, i) => {
    const x = pad + (i / (counts.length - 1)) * innerW;
    const y = pad + innerH - (v / maxVal) * innerH;
    return `${x},${y}`;
  });
  const d = `M ${pts.join(" L ")}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-[140px] w-full text-orange-400/90"
      preserveAspectRatio="none"
      aria-label={`Violation counts over last ${counts.length} scans`}
    >
      <defs>
        <linearGradient id="violationTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(251 146 60)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="rgb(251 146 60)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${pad + innerW} ${pad + innerH} L ${pad} ${pad + innerH} Z`}
        fill="url(#violationTrendFill)"
        className="text-orange-500/20"
      />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SeverityBar({ byImpact }: { byImpact: Record<string, number> }) {
  const parts = SEVERITY_ORDER.map((k) => ({
    key: k,
    count: byImpact[k] ?? 0,
    className: SEVERITY_COLORS[k] ?? "bg-zinc-500",
  }));
  const total = parts.reduce((a, p) => a + p.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex h-8 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
        {total === 0 ? (
          <div
            className={cn("flex w-full items-center justify-center text-xs font-medium", SEVERITY_COLORS.passed)}
            title="No violations in this scan"
          >
            <span className="text-teal-950/90 px-2">No violations detected</span>
          </div>
        ) : (
          parts.map(({ key, count, className }) =>
            count > 0 ? (
              <div
                key={key}
                className={cn(className, "min-w-0 transition-all")}
                style={{ width: `${(count / total) * 100}%` }}
                title={`${key}: ${count}`}
              />
            ) : null,
          )
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-red-500" /> Critical
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-orange-500" /> Serious
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-amber-400" /> Moderate
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-emerald-500" /> Minor
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-teal-400" /> Passed (0 issues)
        </li>
      </ul>
    </div>
  );
}

type Props = {
  history: HistoryEntry[];
  scanLoading: boolean;
  /** URL shown in the “scanning” row while a scan is in progress (from session). */
  pendingScanUrl: string;
  issues: ScanIssue[];
  onNewScanClick: () => void;
  onViewResults: (url: string) => void;
};

export function DashboardOverview({
  history,
  scanLoading,
  pendingScanUrl,
  issues,
  onNewScanClick,
  onViewResults,
}: Props) {
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  const isAuthenticated = status === "authenticated";
  const [dbStats, setDbStats] = useState<{
    totalScans: number;
    completedScans: number;
    averageScore: number | null;
    totalViolations: number;
    severity: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stats when session disappears
      setDbStats(null);
      return;
    }
    fetch("/api/dashboard/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setDbStats(data);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const latestByImpact = useMemo((): Record<string, number> => {
    if (issues.length > 0) {
      const live: Record<string, number> = {};
      for (const i of issues) {
        live[i.impact] = (live[i.impact] ?? 0) + 1;
      }
      return live;
    }
    if (history[0]) return { ...history[0].byImpact };
    return {};
  }, [history, issues]);

  const trendViolationCounts = useMemo(() => {
    return [...history].slice(0, 10).reverse().map((e) => e.totalIssues);
  }, [history]);

  const totalScans = history.length + (scanLoading ? 1 : 0);
  const completedScans = history.length;

  const latestViolationTotal = useMemo(() => {
    let n = 0;
    for (const k of SEVERITY_ORDER) {
      n += latestByImpact[k] ?? 0;
    }
    return n;
  }, [latestByImpact]);

  const uniqueUrlCount = useMemo(
    () => new Set(history.map((e) => dashboardScanUrlKey(e.scannedUrl))).size,
    [history],
  );

  type TableRow = {
    key: string;
    url: string;
    violations: number | null;
    status: "scanning" | "completed" | "failed";
    date: string;
  };

  const tableRows = useMemo((): TableRow[] => {
    const rows: TableRow[] = [];
    if (scanLoading && pendingScanUrl.trim()) {
      rows.push({
        key: "pending",
        url: pendingScanUrl.trim(),
        violations: null,
        status: "scanning",
        date: new Date().toISOString(),
      });
    }
    for (const e of history.slice(0, DASHBOARD_HISTORY_ROWS)) {
      rows.push({
        key: e.id,
        url: e.scannedUrl,
        violations: e.totalIssues,
        status: "completed",
        date: e.savedAt,
      });
    }
    return rows;
  }, [history, scanLoading, pendingScanUrl]);

  return (
    <div className="dashboard-overview space-y-8 px-4 py-6">
      <section className="dashboard-hero-panel px-6 py-7 sm:px-8 sm:py-8" aria-labelledby="dashboard-hero-heading">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="text-emerald-400/85 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              <Sparkles className="size-3.5 shrink-0" aria-hidden />
              {APP_NAME}
            </p>
            <h2
              id="dashboard-hero-heading"
              className="agent-title-gradient text-2xl font-bold tracking-tight sm:text-3xl"
            >
              Clarity for every visitor
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Track WCAG-oriented scans, severity trends, and recent URLs in one calm view—aligned with inclusive design,
              keyboard paths, and voice-friendly flows.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-200/90">
                <ScanSearch className="size-3.5 opacity-80" aria-hidden />
                axe automation
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-200/85">
                WCAG lens
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-200/90">
                <Ear className="size-3.5 opacity-80" aria-hidden />
                Voice-ready UI
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="default"
            className="shrink-0 gap-2 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-cyan-900/30 hover:from-emerald-500 hover:to-cyan-500"
            onClick={onNewScanClick}
          >
            <Plus className="size-4" aria-hidden />
            New scan
          </Button>
        </div>
      </section>

      <div>
        <p className="text-muted-foreground text-sm">
          Saved scans on this device show violation counts and severity mix from axe. The chart below tracks how many
          issues each saved run reported (not a pass/fail grade). For a fuller picture, try{" "}
          <Link href="/testing/ai-report" className="text-emerald-400/90 underline-offset-2 hover:underline">
            AI report Analysis
          </Link>{" "}
          via the AI Testing hub.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="dashboard-stat-card rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Total scans</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">{totalScans}</p>
        </div>
        <div className="dashboard-stat-card rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />
            Completed
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">{completedScans}</p>
        </div>
        <div className="dashboard-stat-card rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <AlertTriangle className="size-3.5 text-orange-400" aria-hidden />
            Latest violations
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">
            {issues.length > 0 || history.length > 0 ? latestViolationTotal : "—"}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
            From your current session or most recent saved scan
          </p>
        </div>
        <div className="dashboard-stat-card rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <Globe className="size-3.5 text-violet-400" aria-hidden />
            Unique URLs
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">
            {completedScans > 0 ? uniqueUrlCount : "—"}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-snug">Distinct pages in saved history</p>
        </div>
      </div>

      {dbStats && user && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5 backdrop-blur-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
            <BarChart3 className="size-4" aria-hidden />
            Server-backed stats
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Aggregated from all scans saved to your account.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Total</p>
              <p className="text-xl font-bold tabular-nums text-zinc-100">{dbStats.totalScans}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Completed</p>
              <p className="text-xl font-bold tabular-nums text-zinc-100">{dbStats.completedScans}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Avg score</p>
              <p className="text-xl font-bold tabular-nums text-zinc-100">{dbStats.averageScore ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[11px] uppercase">Total violations</p>
              <p className="text-xl font-bold tabular-nums text-zinc-100">{dbStats.totalViolations}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href="/compare" className="text-emerald-400/90 text-xs hover:underline">
              Compare scans
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-zinc-100">Violation trend</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Last {Math.min(10, history.length)} saved scans (oldest → newest), by issue count
          </p>
          <div className="mt-4">
            <ViolationTrendChart counts={trendViolationCounts} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-sm">
          <h2 className="text-sm font-semibold text-zinc-100">Issues by severity</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Latest scan data ·{" "}
            <span className="tabular-nums text-zinc-400">{latestViolationTotal}</span> violation instance
            {latestViolationTotal === 1 ? "" : "s"} (axe)
          </p>
          <div className="mt-6">
            <SeverityBar byImpact={latestByImpact} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-5 backdrop-blur-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Recent scans</h2>
            <p className="text-muted-foreground text-xs">
              Latest {DASHBOARD_HISTORY_ROWS} saved scans.{" "}
              <Link href="/history" className="text-emerald-400/90 underline-offset-2 hover:underline">
                History
              </Link>{" "}
              has the full list.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={onNewScanClick}
          >
            <Plus className="size-4" aria-hidden />
            New scan
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs tracking-wide text-zinc-500 uppercase">
                <th className="pb-3 pr-4 font-medium">URL</th>
                <th className="pb-3 pr-4 font-medium">Violations</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                    No scans yet. Open New scan to check your first page.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row.key} className="border-b border-white/[0.06]">
                    <td className="max-w-[220px] py-3 pr-4">
                      <span className="line-clamp-2 break-all text-zinc-200">{row.url}</span>
                    </td>
                    <td className="py-3 pr-4">
                      {row.status === "scanning" ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs tabular-nums">
                          <Loader2 className="size-3.5 shrink-0 animate-spin opacity-70" aria-hidden />
                          …
                        </span>
                      ) : row.violations !== null ? (
                        <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300 tabular-nums">
                          {row.violations}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {row.status === "scanning" ? (
                        <span className="inline-flex items-center gap-2 text-emerald-400">
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                          </span>
                          Scanning
                        </span>
                      ) : (
                        <span className="text-emerald-400/90">Completed</span>
                      )}
                    </td>
                    <td className="text-muted-foreground py-3 pr-4 tabular-nums">
                      {formatScanDate(row.date)}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        disabled={row.status === "scanning"}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10",
                          row.status === "scanning" && "pointer-events-none opacity-50",
                        )}
                        onClick={() => onViewResults(row.url)}
                      >
                        View results
                        <ArrowRight className="ml-1 size-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">
          <Info className="mr-1 inline-block size-3.5 align-text-bottom text-zinc-500" aria-hidden />
          Counts reflect saved automated results (not live pages). Not a legal pass/fail.
        </p>
      </div>

      <div className="flex justify-center border-t border-white/5 pt-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
          onClick={onNewScanClick}
        >
          <ScanSearch className="size-4" aria-hidden />
          Jump to scanner
        </button>
      </div>
    </div>
  );
}
