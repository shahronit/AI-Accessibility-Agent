"use client";

import { LayoutList, ListFilter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueCard } from "@/components/IssueCard";
import type { ImpactLevel, ScanIssue } from "@/lib/axeScanner";

export type ImpactFilter = "all" | ImpactLevel;

type Props = {
  issues: ScanIssue[];
  filter: ImpactFilter;
  onFilterChange: (f: ImpactFilter) => void;
  selected: ScanIssue | null;
  onSelect: (issue: ScanIssue) => void;
  onExplain: (issue: ScanIssue) => void;
  explainingId: number | null;
};

export function ResultsList({
  issues,
  filter,
  onFilterChange,
  selected,
  onSelect,
  onExplain,
  explainingId,
}: Props) {
  const filtered = filter === "all" ? issues : issues.filter((i) => i.impact === filter);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-xl border border-white/10 bg-card/50 shadow-inner backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 pt-3 pb-1">
        <ListFilter className="text-primary size-4 shrink-0" aria-hidden />
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Filter</span>
        <Tabs
          value={filter}
          onValueChange={(v) => onFilterChange(v as ImpactFilter)}
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

      <ScrollArea className="min-h-[320px] flex-1 px-2 pb-2">
        <div className="space-y-3 pr-2">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
              <LayoutList className="size-10 opacity-40" aria-hidden />
              <p>No issues match this filter.</p>
            </div>
          ) : (
            filtered.map((issue) => (
              <IssueCard
                key={`${issue.index}-${issue.id}-${issue.html.slice(0, 40)}`}
                issue={issue}
                selected={selected?.index === issue.index}
                onSelect={onSelect}
                onExplain={onExplain}
                explaining={explainingId === issue.index}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
