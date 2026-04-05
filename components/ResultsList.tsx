"use client";

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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Tabs
        value={filter}
        onValueChange={(v) => onFilterChange(v as ImpactFilter)}
        className="w-full"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1" aria-label="Filter by impact">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="critical">Critical</TabsTrigger>
          <TabsTrigger value="serious">Serious</TabsTrigger>
          <TabsTrigger value="moderate">Moderate</TabsTrigger>
          <TabsTrigger value="minor">Minor</TabsTrigger>
        </TabsList>
      </Tabs>

      <ScrollArea className="min-h-[320px] flex-1 rounded-lg border">
        <div className="space-y-3 p-3">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">No issues match this filter.</p>
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
