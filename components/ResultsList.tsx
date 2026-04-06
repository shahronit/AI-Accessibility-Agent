"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutList, ListFilter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueCard } from "@/components/IssueCard";
import type { ImpactLevel, ScanIssue } from "@/lib/axeScanner";
import { cn } from "@/lib/utils";

export const RESULTS_PAGE_SIZE = 10;

export type ImpactFilter = "all" | ImpactLevel;

type Props = {
  issues: ScanIssue[];
  filter: ImpactFilter;
  onFilterChange: (f: ImpactFilter) => void;
  selected: ScanIssue | null;
  onSelect: (issue: ScanIssue) => void;
  onExplain: (issue: ScanIssue) => void;
  explainingId: number | null;
  onReportJira?: (issue: ScanIssue) => void;
  jiraLoading?: boolean;
  /** Lighter chrome when nested inside a unified scan page card. */
  embedded?: boolean;
};

export function ResultsList({
  issues,
  filter,
  onFilterChange,
  selected,
  onSelect,
  onExplain,
  explainingId,
  onReportJira,
  jiraLoading,
  embedded = false,
}: Props) {
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => (filter === "all" ? issues : issues.filter((i) => i.impact === filter)),
    [issues, filter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / RESULTS_PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const start = (effectivePage - 1) * RESULTS_PAGE_SIZE;
  const end = Math.min(start + RESULTS_PAGE_SIZE, filtered.length);
  const pageItems = filtered.slice(start, start + RESULTS_PAGE_SIZE);

  const handleFilterChange = (f: ImpactFilter) => {
    setPage(1);
    onFilterChange(f);
  };

  useEffect(() => {
    if (!selected) return;
    const idx = filtered.findIndex((i) => i.index === selected.index);
    if (idx === -1) return;
    const target = Math.floor(idx / RESULTS_PAGE_SIZE) + 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- jump to page containing selected issue
    setPage((p) => (p !== target ? target : p));
  }, [selected, filtered]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-0 overflow-hidden",
        embedded
          ? "rounded-lg border border-white/[0.06] bg-black/25"
          : "rounded-xl border border-white/10 bg-card/50 shadow-inner backdrop-blur-sm",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 pt-3 pb-2">
        <ListFilter className="text-primary size-4 shrink-0" aria-hidden />
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Filter
        </span>
        <Tabs
          value={filter}
          onValueChange={(v) => handleFilterChange(v as ImpactFilter)}
          className="w-full min-w-0 flex-1"
        >
          <TabsList
            className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/40"
            aria-label="Filter by impact"
          >
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="critical">Critical</TabsTrigger>
            <TabsTrigger value="serious">Serious</TabsTrigger>
            <TabsTrigger value="moderate">Moderate</TabsTrigger>
            <TabsTrigger value="minor">Minor</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {explainingId !== null ? (
        <div
          className="border-b border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            Opening explanation in a new tab…
          </span>
        </div>
      ) : null}

      {filtered.length > RESULTS_PAGE_SIZE ? (
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-xs">
          <span className="tabular-nums">
            Showing <span className="text-foreground font-medium">{filtered.length === 0 ? 0 : start + 1}</span>–
            <span className="text-foreground font-medium">{end}</span> of{" "}
            <span className="text-foreground font-medium">{filtered.length}</span>
          </span>
          <span className="tabular-nums">
            Page {effectivePage} of {totalPages}
          </span>
        </div>
      ) : null}

      <ScrollArea className="min-h-[min(480px,52vh)] flex-1 px-2 pb-2">
        <div className="space-y-3 pr-2 pt-1">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
              <LayoutList className="size-10 opacity-40" aria-hidden />
              <p>No issues match this filter.</p>
            </div>
          ) : (
            pageItems.map((issue) => (
              <IssueCard
                key={`${issue.index}-${issue.id}-${issue.html.slice(0, 40)}`}
                issue={issue}
                selected={selected?.index === issue.index}
                onSelect={onSelect}
                onExplain={onExplain}
                explaining={explainingId === issue.index}
                onReportJira={onReportJira}
                jiraLoading={jiraLoading}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {filtered.length > RESULTS_PAGE_SIZE ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2.5"
          aria-label="Results pages"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 border-white/10 bg-black/30"
            disabled={effectivePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Button>
          <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-1 text-xs">
            {totalPages <= 9 ? (
              Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={n === effectivePage ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "size-8 min-w-8 p-0 tabular-nums",
                    n === effectivePage && "bg-emerald-500/20 text-emerald-200",
                  )}
                  onClick={() => setPage(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === effectivePage ? "page" : undefined}
                >
                  {n}
                </Button>
              ))
            ) : (
              <span className="text-foreground px-2 font-medium tabular-nums">
                {effectivePage} / {totalPages}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 border-white/10 bg-black/30"
            disabled={effectivePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
