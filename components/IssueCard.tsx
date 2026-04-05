"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ImpactLevel, ScanIssue } from "@/lib/axeScanner";

const impactVariant: Record<ImpactLevel, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  serious: "default",
  moderate: "secondary",
  minor: "outline",
};

type Props = {
  issue: ScanIssue;
  selected: boolean;
  onSelect: (issue: ScanIssue) => void;
  onExplain: (issue: ScanIssue) => void;
  explaining?: boolean;
};

export function IssueCard({ issue, selected, onSelect, onExplain, explaining }: Props) {
  return (
    <Card
      data-issue-index={issue.index}
      className={`cursor-pointer transition-colors ${selected ? "ring-ring ring-2" : ""}`}
      onClick={() => onSelect(issue)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(issue);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">#{issue.index}</span>
          <Badge variant={impactVariant[issue.impact]}>{issue.impact}</Badge>
          <span className="font-mono text-sm">{issue.id}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onExplain(issue);
          }}
          disabled={explaining}
        >
          {explaining ? "Explaining…" : "Explain with AI"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm leading-relaxed">{issue.description}</p>
        {issue.html ? (
          <pre className="bg-muted max-h-32 overflow-x-auto overflow-y-auto rounded-md p-2 text-xs whitespace-pre-wrap">
            {issue.html}
          </pre>
        ) : null}
        <a
          href={issue.helpUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-xs underline-offset-4 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Documentation
        </a>
      </CardContent>
    </Card>
  );
}
