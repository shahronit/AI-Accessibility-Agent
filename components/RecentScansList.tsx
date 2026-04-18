"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, History as HistoryIcon, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

type HistoryScan = {
  id: string;
  url: string;
  scannedAt: string;
  wcagPreset: string;
  issueCount: number;
  reviewCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  diffVsPrevious?: { added: number; resolved: number };
};

type ApiResponse = {
  scans: HistoryScan[];
  total: number;
  limit: number;
  offset: number;
};

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

function truncateUrl(url: string, max = 64) {
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + "…";
}

/**
 * Severity dot row. Red = critical, amber = serious, sky = moderate, green
 * = minor (per the brief, with sky for moderate so amber stays unique to
 * serious and the four levels stay visually distinct).
 */
function SeverityDots({ scan }: { scan: HistoryScan }) {
  const dots: { label: string; count: number; color: string }[] = [
    { label: "Critical", count: scan.criticalCount, color: "bg-rose-500" },
    { label: "Serious", count: scan.seriousCount, color: "bg-amber-400" },
    { label: "Moderate", count: scan.moderateCount, color: "bg-sky-400" },
    { label: "Minor", count: scan.minorCount, color: "bg-emerald-400" },
  ];
  return (
    <div className="flex items-center gap-2" aria-label="Severity breakdown">
      {dots.map((d) => (
        <span
          key={d.label}
          className="text-muted-foreground inline-flex items-center gap-1 text-xs tabular-nums"
          title={`${d.label}: ${d.count}`}
        >
          <span className={cn("inline-block size-2.5 rounded-full", d.color)} aria-hidden />
          {d.count}
        </span>
      ))}
    </div>
  );
}

/**
 * Fix 7 - paginated cross-URL listing of saved scans backed by
 * `/api/scan-history`. Stays client-side because the list responds to
 * Previous / Next without a full navigation.
 */
export function RecentScansList() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((nextPage: number) => {
    setLoading(true);
    setError(null);
    fetch(`/api/scan-history?limit=${PAGE_SIZE}&offset=${nextPage * PAGE_SIZE}`)
      .then(async (res) => {
        if (res.status === 401) {
          throw new Error("Sign in to see saved scans.");
        }
        if (!res.ok) {
          throw new Error(`Could not load history (${res.status}).`);
        }
        return (await res.json()) as ApiResponse;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load history.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips loading=true before fetching; the cascade is intentional.
    load(page);
  }, [load, page]);

  const total = data?.total ?? 0;
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  return (
    <Card className="agent-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HistoryIcon className="size-4" aria-hidden />
            Recent scans
          </CardTitle>
          <CardDescription>
            All scans this app has stored, newest first. Click a row to open the saved report.
          </CardDescription>
        </div>
        {data ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {total === 0 ? "0" : `${page * PAGE_SIZE + 1}-${Math.min(total, (page + 1) * PAGE_SIZE)}`} of {total}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-muted-foreground inline-flex items-center gap-2 text-sm" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading recent scans…
          </p>
        ) : error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : !data || data.scans.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-white/[0.06] bg-black/20 px-4 py-8 text-center text-sm">
            No scans yet. Run your first scan to see history here.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.scans.map((s) => {
              const reportHref = `/report/${s.id}`;
              const diff = s.diffVsPrevious;
              return (
                <li
                  key={s.id}
                  className="border-border/60 group flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-4 transition-colors hover:bg-black/25 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Link
                      href={reportHref}
                      className="text-primary block truncate font-medium underline-offset-2 hover:underline"
                      title={s.url}
                    >
                      {truncateUrl(s.url)}
                    </Link>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                      <span className="tabular-nums">{formatWhen(s.scannedAt)}</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <strong className="text-zinc-200">{s.issueCount}</strong> issue
                        {s.issueCount === 1 ? "" : "s"}
                      </span>
                      <span className="uppercase tracking-wide text-zinc-400">{s.wcagPreset}</span>
                      <SeverityDots scan={s} />
                      {diff && (diff.added > 0 || diff.resolved > 0) ? (
                        <span
                          className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-200"
                          title="Diff vs. the previous scan of this URL"
                        >
                          {diff.added > 0 ? (
                            <span className="text-rose-300">+{diff.added}</span>
                          ) : null}
                          {diff.added > 0 && diff.resolved > 0 ? <span className="text-zinc-400">/</span> : null}
                          {diff.resolved > 0 ? (
                            <span className="text-emerald-300">-{diff.resolved}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={reportHref}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "shrink-0 gap-1.5",
                    )}
                  >
                    Open report
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {data && total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!hasPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
