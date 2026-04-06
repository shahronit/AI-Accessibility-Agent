"use client";

import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Code2,
  Info,
  Loader2,
  OctagonAlert,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ImpactLevel, ScanIssue } from "@/lib/axeScanner";
import { cn } from "@/lib/utils";

const impactVariant: Record<ImpactLevel, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  serious: "default",
  moderate: "secondary",
  minor: "outline",
};

const impactIcon: Record<ImpactLevel, typeof AlertTriangle> = {
  critical: OctagonAlert,
  serious: AlertTriangle,
  moderate: AlertCircle,
  minor: Info,
};

type Props = {
  issue: ScanIssue;
  selected: boolean;
  onSelect: (issue: ScanIssue) => void;
  onExplain: (issue: ScanIssue) => void;
  explaining?: boolean;
};

export function IssueCard({ issue, selected, onSelect, onExplain, explaining }: Props) {
  const ImpactIcon = impactIcon[issue.impact];

  return (
    <Card
      data-issue-index={issue.index}
      className={cn(
        "agent-card cursor-pointer transition-all duration-200 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/5",
        selected && "border-primary/50 ring-primary/30 shadow-lg shadow-primary/10 ring-2",
      )}
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
          <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
            #{issue.index}
          </span>
          <Badge variant={impactVariant[issue.impact]} className="gap-1 capitalize">
            <ImpactIcon className="size-3.5" aria-hidden />
            {issue.impact}
          </Badge>
          <span className="text-primary/90 font-mono text-sm tracking-tight">{issue.id}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5 shadow-sm"
          onClick={(e) => {
            e.stopPropagation();
            onExplain(issue);
          }}
          disabled={explaining}
        >
          {explaining ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Working…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 text-amber-400" aria-hidden />
              Explain with AI
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed">{issue.description}</p>
        {issue.html ? (
          <div className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Code2 className="size-3.5" aria-hidden />
              Affected markup
            </p>
            <pre className="bg-muted/80 max-h-32 overflow-x-auto overflow-y-auto rounded-lg border border-white/5 p-3 font-mono text-xs whitespace-pre-wrap">
              {issue.html}
            </pre>
          </div>
        ) : null}
        <a
          href={issue.helpUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          WCAG documentation
        </a>
      </CardContent>
    </Card>
  );
}
