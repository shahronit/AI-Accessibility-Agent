"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { loadScanHistory } from "@/lib/scanHistory";
import { ArrowDown, ArrowUp, GitCompareArrows, Loader2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ScanOption {
  id: string;
  url: string;
  started_at: string;
  overall_score: number | null;
  source: "db" | "local";
}

interface ComparisonData {
  scanA: { id: string; url: string; score: number; violations: number; passes: number; pagesScanned: number; date: string };
  scanB: { id: string; url: string; score: number; violations: number; passes: number; pagesScanned: number; date: string };
  comparison: {
    scoreDiff: number;
    violationsDiff: number;
    passesDiff: number;
    improved: boolean;
    fixed: { ruleId: string; count: number; impact: string }[];
    introduced: { ruleId: string; count: number; impact: string }[];
    unchanged: number;
  };
}

function MetricCard({ label, valueA, valueB, diff, invert }: {
  label: string;
  valueA: string | number;
  valueB: string | number;
  diff: number;
  invert?: boolean;
}) {
  const improved = invert ? diff < 0 : diff > 0;
  const regressed = invert ? diff > 0 : diff < 0;
  return (
    <div className="border-border/60 rounded-xl border bg-black/25 p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-2 flex items-end gap-4">
        <div>
          <p className="text-muted-foreground text-xs">Before</p>
          <p className="text-xl font-bold tabular-nums">{valueA}</p>
        </div>
        <div className="text-muted-foreground pb-1">→</div>
        <div>
          <p className="text-muted-foreground text-xs">After</p>
          <p className="text-xl font-bold tabular-nums">{valueB}</p>
        </div>
        <div className={cn(
          "ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          improved && "bg-emerald-500/15 text-emerald-400",
          regressed && "bg-red-500/15 text-red-400",
          diff === 0 && "bg-zinc-500/15 text-zinc-400",
        )}>
          {diff > 0 ? <ArrowUp className="size-3" /> : diff < 0 ? <ArrowDown className="size-3" /> : <Minus className="size-3" />}
          {diff > 0 ? "+" : ""}{diff}
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const [scans, setScans] = useState<ScanOption[]>([]);
  const [scanA, setScanA] = useState("");
  const [scanB, setScanB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComparisonData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const localScans: ScanOption[] = loadScanHistory().map((h) => ({
      id: h.id,
      url: h.scannedUrl,
      started_at: h.savedAt,
      overall_score: h.issues?.length != null
        ? Math.round(100 * (1 - h.totalIssues / Math.max(h.totalIssues + (h.byImpact ? Object.keys(h.byImpact).length : 1), 1)))
        : null,
      source: "local" as const,
    }));

    if (!isAuthenticated) {
      setScans(localScans);
      return;
    }

    fetch("/api/dashboard/history?limit=50")
      .then((r) => r.json())
      .then((data) => {
        const dbScans: ScanOption[] = (data.scans || [])
          .filter((s: ScanOption & { status: string }) => s.status === "completed")
          .map((s: ScanOption) => ({ ...s, source: "db" as const }));

        const dbIds = new Set(dbScans.map((s) => s.id));
        const merged = [...dbScans, ...localScans.filter((l) => !dbIds.has(l.id))];
        setScans(merged);
      })
      .catch(() => {
        setScans(localScans);
      });
  }, [isAuthenticated]);

  const compareLocal = useCallback(() => {
    const history = loadScanHistory();
    const a = history.find((h) => h.id === scanA);
    const b = history.find((h) => h.id === scanB);
    if (!a || !b) throw new Error("Could not find selected scans in local history");

    const aViolations = a.totalIssues;
    const bViolations = b.totalIssues;
    const aPasses = Object.keys(a.byImpact).length || 1;
    const bPasses = Object.keys(b.byImpact).length || 1;
    const aScore = Math.round(100 * (1 - aViolations / Math.max(aViolations + aPasses, 1)));
    const bScore = Math.round(100 * (1 - bViolations / Math.max(bViolations + bPasses, 1)));

    const aRules = new Set((a.issues || []).map((i) => i.id));
    const bRules = new Set((b.issues || []).map((i) => i.id));
    const fixed = [...aRules].filter((r) => !bRules.has(r)).map((r) => {
      const issue = (a.issues || []).find((i) => i.id === r);
      return { ruleId: r, count: 1, impact: issue?.impact || "unknown" };
    });
    const introduced = [...bRules].filter((r) => !aRules.has(r)).map((r) => {
      const issue = (b.issues || []).find((i) => i.id === r);
      return { ruleId: r, count: 1, impact: issue?.impact || "unknown" };
    });

    const scoreDiff = bScore - aScore;
    return {
      scanA: { id: a.id, url: a.scannedUrl, score: aScore, violations: aViolations, passes: aPasses, pagesScanned: 1, date: a.savedAt },
      scanB: { id: b.id, url: b.scannedUrl, score: bScore, violations: bViolations, passes: bPasses, pagesScanned: 1, date: b.savedAt },
      comparison: {
        scoreDiff,
        violationsDiff: bViolations - aViolations,
        passesDiff: bPasses - aPasses,
        improved: scoreDiff > 0,
        fixed,
        introduced,
        unchanged: [...aRules].filter((r) => bRules.has(r)).length,
      },
    } satisfies ComparisonData;
  }, [scanA, scanB]);

  const compare = useCallback(async () => {
    if (!scanA || !scanB) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const aScan = scans.find((s) => s.id === scanA);
    const bScan = scans.find((s) => s.id === scanB);
    const bothDb = aScan?.source === "db" && bScan?.source === "db";

    try {
      if (bothDb && isAuthenticated) {
        const res = await fetch(`/api/reports/compare?scanA=${scanA}&scanB=${scanB}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Comparison failed");
        setResult(data);
      } else {
        setResult(compareLocal());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setLoading(false);
    }
  }, [scanA, scanB, isAuthenticated, scans, compareLocal]);

  if (scans.length === 0 && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <GitCompareArrows className="text-muted-foreground size-12" />
        <h2 className="text-lg font-semibold">No scans to compare</h2>
        <p className="text-muted-foreground text-sm">
          Run at least two scans first, then come back to compare them. Sign in to persist scans to the database.
        </p>
        <Link href="/signin" className="text-emerald-400 text-sm hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Compare two scans</h2>
        <p className="text-muted-foreground text-sm">
          Select two completed scans to compare scores, violations, and rule changes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="compare-a" className="text-sm font-medium text-zinc-300">Scan A (before)</label>
          <select
            id="compare-a"
            value={scanA}
            onChange={(e) => setScanA(e.target.value)}
            className="border-border bg-background h-10 w-full rounded-lg border px-3 text-sm"
          >
            <option value="">Select a scan...</option>
            {scans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.url} — {new Date(s.started_at).toLocaleDateString()}{s.overall_score != null ? ` (score: ${s.overall_score})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="compare-b" className="text-sm font-medium text-zinc-300">Scan B (after)</label>
          <select
            id="compare-b"
            value={scanB}
            onChange={(e) => setScanB(e.target.value)}
            className="border-border bg-background h-10 w-full rounded-lg border px-3 text-sm"
          >
            <option value="">Select a scan...</option>
            {scans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.url} — {new Date(s.started_at).toLocaleDateString()}{s.overall_score != null ? ` (score: ${s.overall_score})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={compare}
        disabled={!scanA || !scanB || scanA === scanB || loading}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <GitCompareArrows className="size-4" />}
        Compare
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-6">
          <div className={cn(
            "flex items-center gap-3 rounded-xl p-4 text-sm font-medium",
            result.comparison.improved
              ? "bg-emerald-500/10 text-emerald-300"
              : result.comparison.scoreDiff < 0
              ? "bg-red-500/10 text-red-300"
              : "bg-zinc-500/10 text-zinc-300",
          )}>
            {result.comparison.improved ? (
              <ArrowUp className="size-5" />
            ) : result.comparison.scoreDiff < 0 ? (
              <ArrowDown className="size-5" />
            ) : (
              <Minus className="size-5" />
            )}
            {result.comparison.improved
              ? `Score improved by ${result.comparison.scoreDiff} points`
              : result.comparison.scoreDiff < 0
              ? `Score decreased by ${Math.abs(result.comparison.scoreDiff)} points`
              : "No change in score"}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              label="Score"
              valueA={result.scanA.score}
              valueB={result.scanB.score}
              diff={result.comparison.scoreDiff}
            />
            <MetricCard
              label="Violations"
              valueA={result.scanA.violations}
              valueB={result.scanB.violations}
              diff={result.comparison.violationsDiff}
              invert
            />
            <MetricCard
              label="Passes"
              valueA={result.scanA.passes}
              valueB={result.scanB.passes}
              diff={result.comparison.passesDiff}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.comparison.fixed.length > 0 && (
              <div className="border-border/60 rounded-xl border bg-emerald-500/5 p-4">
                <h3 className="text-sm font-semibold text-emerald-400">
                  Fixed ({result.comparison.fixed.length} rules)
                </h3>
                <ul className="mt-2 space-y-1">
                  {result.comparison.fixed.map((r) => (
                    <li key={r.ruleId} className="text-muted-foreground text-xs">
                      <code className="text-emerald-300">{r.ruleId}</code>
                      <span className="ml-2">({r.count} instances)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.comparison.introduced.length > 0 && (
              <div className="border-border/60 rounded-xl border bg-red-500/5 p-4">
                <h3 className="text-sm font-semibold text-red-400">
                  New issues ({result.comparison.introduced.length} rules)
                </h3>
                <ul className="mt-2 space-y-1">
                  {result.comparison.introduced.map((r) => (
                    <li key={r.ruleId} className="text-muted-foreground text-xs">
                      <code className="text-red-300">{r.ruleId}</code>
                      <span className="ml-2">({r.count} instances)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.comparison.unchanged > 0 && (
            <p className="text-muted-foreground text-xs">
              {result.comparison.unchanged} rule(s) remain unchanged between scans.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
