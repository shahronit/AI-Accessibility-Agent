"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  HelpCircle,
  LayoutDashboard,
  ScanSearch,
} from "lucide-react";
import { SeverityPieChart } from "@/components/SeverityPieChart";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ImpactLevel, ScanIssue } from "@/lib/axeScanner";
import { complianceRiskFromCounts } from "@/lib/complianceRisk";
import { allJiraBugTitles, jiraBugReportTitle, pagePathFromScannedUrl } from "@/lib/jiraBugTitle";
import { cn } from "@/lib/utils";

const IMPACT_ORDER: ImpactLevel[] = ["critical", "serious", "moderate", "minor"];

const IMPACT_STYLES: Record<ImpactLevel, { bar: string; text: string; badge: string }> = {
  critical: {
    bar: "bg-red-500",
    text: "text-red-400",
    badge: "border-red-500/40 bg-red-500/15 text-red-300",
  },
  serious: {
    bar: "bg-orange-500",
    text: "text-orange-400",
    badge: "border-orange-500/40 bg-orange-500/15 text-orange-300",
  },
  moderate: {
    bar: "bg-amber-400",
    text: "text-amber-300",
    badge: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  },
  minor: {
    bar: "bg-emerald-500",
    text: "text-emerald-400",
    badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  },
};

function MetricTile({
  label,
  value,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: number | string;
  icon: typeof FileText;
  iconClass: string;
}) {
  return (
    <div className="border-border/50 from-card/90 to-card/40 flex flex-col gap-2 rounded-xl border bg-gradient-to-br p-4 shadow-inner">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg border border-white/10", iconClass)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="text-foreground text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function buildOverviewParagraph(
  scannedUrl: string,
  wcagLabel: string,
  violationInstances: number,
  passRules: number,
  summary: string,
  needsReviewListed?: number,
): string {
  const shortUrl = scannedUrl.length > 72 ? `${scannedUrl.slice(0, 69)}…` : scannedUrl;
  let body = `Accessibility scan for ${shortUrl} (${wcagLabel}). The automated check found ${violationInstances} violation instance${violationInstances === 1 ? "" : "s"} and ${passRules} rule${passRules === 1 ? "" : "s"} that passed.`;
  if (needsReviewListed && needsReviewListed > 0) {
    body += ` ${needsReviewListed} additional finding${needsReviewListed === 1 ? "" : "s"} need manual review (axe incomplete).`;
  }
  return `${body} ${summary}`;
}

type Props = {
  scannedUrl: string;
  issues: ScanIssue[];
  wcagLabel?: string;
  passRules?: number;
  needsReview?: number;
  savedAt?: string | null;
  showSampleNotice?: boolean;
  totalIssuesHint?: number;
};

export function ScanFindingsReport({
  scannedUrl,
  issues,
  wcagLabel = "WCAG 2.1 Level AA",
  passRules = 0,
  needsReview = 0,
  savedAt,
  showSampleNotice,
  totalIssuesHint,
}: Props) {
  const [impactFilter, setImpactFilter] = useState<ImpactLevel | "all">("all");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [reportTab, setReportTab] = useState<"violations" | "review" | "jira">("violations");

  const violationIssues = useMemo(
    () => issues.filter((i) => i.kind !== "needs_review"),
    [issues],
  );
  const reviewIssuesList = useMemo(
    () => issues.filter((i) => i.kind === "needs_review"),
    [issues],
  );
  const violationCount = violationIssues.length;
  const reviewFindingCount = reviewIssuesList.length;
  const needsReviewDisplay =
    reviewFindingCount > 0 ? reviewFindingCount : needsReview > 0 ? needsReview : 0;

  const byImpact = useMemo(() => {
    const b: Record<ImpactLevel, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const i of violationIssues) {
      b[i.impact]++;
    }
    return b;
  }, [violationIssues]);

  const filteredViolations = useMemo(
    () =>
      impactFilter === "all" ? violationIssues : violationIssues.filter((i) => i.impact === impactFilter),
    [violationIssues, impactFilter],
  );

  const filteredReviews = useMemo(
    () =>
      impactFilter === "all" ? reviewIssuesList : reviewIssuesList.filter((i) => i.impact === impactFilter),
    [reviewIssuesList, impactFilter],
  );

  const filteredJiraCombined = useMemo(
    () => [...filteredViolations, ...filteredReviews],
    [filteredViolations, filteredReviews],
  );

  const summary = complianceRiskFromCounts(byImpact, needsReviewDisplay);
  const pathLabel = pagePathFromScannedUrl(scannedUrl);

  const copyText = useCallback(async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(hint);
      window.setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint("Copy failed — select text manually");
    }
  }, []);

  const allIssuesForJira = useMemo(() => [...violationIssues, ...reviewIssuesList], [violationIssues, reviewIssuesList]);

  const copyAllJira = useCallback(() => {
    if (allIssuesForJira.length === 0) return;
    void copyText(allJiraBugTitles(allIssuesForJira, scannedUrl), "All Jira titles copied");
  }, [scannedUrl, allIssuesForJira, copyText]);

  return (
    <div className="text-sm leading-relaxed text-zinc-300">
      <div className="border-border/40 mx-auto flex max-w-[min(100%,1440px)] flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
          >
            <LayoutDashboard className="size-4 shrink-0" aria-hidden />
            Dashboard
          </Link>
          <Link
            href={`/scan?url=${encodeURIComponent(scannedUrl)}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
          >
            <ScanSearch className="size-4 shrink-0" aria-hidden />
            Open in scanner
          </Link>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex gap-2")}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      </div>

      <div className="mx-auto max-w-[min(100%,1440px)] space-y-6 px-4 py-6">
        {showSampleNotice ? (
          <Alert className="border-amber-500/30 bg-amber-950/20">
            <AlertTitle className="text-sm">Partial findings</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">
              {totalIssuesHint != null && totalIssuesHint > issues.length
                ? `Showing ${issues.length} of ${totalIssuesHint} saved issues. Run a new scan from the scanner for the full list, Explain with AI, and exports.`
                : "These rows are from a saved sample only. Run a new scan from the scanner for the full list and latest results."}
            </AlertDescription>
          </Alert>
        ) : null}

        {savedAt ? (
          <p className="text-muted-foreground text-xs">
            Saved scan ·{" "}
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(savedAt),
            )}
          </p>
        ) : null}

        <div className="border-border/60 relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-emerald-950/20 p-6 shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)] sm:p-8">
          <div
            className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-emerald-500/10 blur-3xl"
            aria-hidden
          />
          <div className="relative space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold tracking-widest text-emerald-300 uppercase shadow-[0_0_20px_rgba(52,211,153,0.15)]"
                aria-label="Report type"
              >
                Scan findings report
              </span>
              <Badge variant="outline" className="border-white/15 text-muted-foreground text-[10px]">
                {wcagLabel}
              </Badge>
              {impactFilter !== "all" ? (
                <Badge className="border-orange-500/40 bg-orange-500/15 text-orange-200 capitalize">
                  Filter: {impactFilter}
                </Badge>
              ) : null}
            </div>
            <p className="text-foreground/95 max-w-4xl text-sm leading-relaxed sm:text-[15px]">
              {buildOverviewParagraph(
                scannedUrl,
                wcagLabel,
                violationCount,
                passRules,
                summary,
                reviewFindingCount > 0 ? reviewFindingCount : undefined,
              )}
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile label="Pages scanned" value={1} icon={FileText} iconClass="bg-violet-500/15 text-violet-300" />
              <MetricTile
                label="Violations"
                value={violationCount}
                icon={AlertTriangle}
                iconClass="bg-orange-500/15 text-orange-400"
              />
              <MetricTile
                label="Passes"
                value={passRules > 0 ? passRules : "—"}
                icon={CheckCircle2}
                iconClass="bg-emerald-500/15 text-emerald-400"
              />
              <MetricTile
                label="Needs review"
                value={needsReviewDisplay > 0 ? needsReviewDisplay : "—"}
                icon={HelpCircle}
                iconClass="bg-violet-500/15 text-violet-300"
              />
            </div>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                  Issues by severity
                </h3>
                <SeverityPieChart
                  byImpact={byImpact}
                  selected={impactFilter}
                  onSelect={setImpactFilter}
                  className="justify-center sm:justify-start"
                />
                <p className="text-muted-foreground mt-3 max-w-xs text-xs leading-relaxed">
                  Chart reflects violations only. Use the Needs review tab for axe incomplete items. Click a slice to
                  filter severity on Violations and Needs review lists.
                </p>
              </div>
              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                  Severity breakdown
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {IMPACT_ORDER.map((level) => {
                    const count = byImpact[level];
                    const active = impactFilter === "all" || impactFilter === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setImpactFilter(impactFilter === level ? "all" : level)}
                        className={cn(
                          "border-border/50 rounded-xl border bg-black/25 px-4 py-3 text-left transition-colors",
                          active ? "ring-2 ring-emerald-500/40" : "hover:border-white/15",
                        )}
                        aria-pressed={impactFilter === level}
                      >
                        <p className={cn("text-2xl font-semibold tabular-nums capitalize", IMPACT_STYLES[level].text)}>
                          {count}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs capitalize">{level}</p>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={cn("h-full rounded-full transition-all", IMPACT_STYLES[level].bar)}
                            style={{
                              width: `${violationCount ? Math.min(100, (count / violationCount) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="report-issues-section" className="border-border/50 rounded-2xl border border-white/10 bg-card/40 p-4 shadow-inner sm:p-6">
          <Tabs value={reportTab} onValueChange={(v) => setReportTab(v as "violations" | "review" | "jira")} className="w-full gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/30 sm:w-auto">
                <TabsTrigger value="violations" className="gap-1.5 tabular-nums">
                  Violations ({filteredViolations.length}
                  {impactFilter !== "all" ? ` · ${impactFilter}` : ""})
                </TabsTrigger>
                <TabsTrigger value="review" className="gap-1.5 tabular-nums">
                  Needs review ({filteredReviews.length}
                  {impactFilter !== "all" ? ` · ${impactFilter}` : ""})
                </TabsTrigger>
                <TabsTrigger value="jira" className="gap-1.5 tabular-nums">
                  Jira ({filteredJiraCombined.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {copyHint ? (
              <p className="text-emerald-400/90 text-sm" role="status">
                {copyHint}
              </p>
            ) : null}

            <TabsContent value="violations" className="mt-4 space-y-3 outline-none">
              {filteredViolations.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {violationCount === 0
                    ? "No violations in this result."
                    : `No ${impactFilter} violations. Adjust the severity filter or open Needs review.`}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredViolations.map((issue) => (
                    <li
                      key={`${issue.index}-${issue.id}-${issue.html.slice(0, 24)}`}
                      className="border-border/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-black/20 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm font-medium">{issue.description}</p>
                        <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                          #{issue.index} · {issue.id} · {pathLabel}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                          IMPACT_STYLES[issue.impact].badge,
                        )}
                      >
                        {issue.impact}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="review" className="mt-4 space-y-3 outline-none">
              {filteredReviews.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  {reviewFindingCount === 0
                    ? "No needs-review (incomplete) items for this result."
                    : `No ${impactFilter} needs-review items. Adjust the severity filter or show all.`}
                </p>
              ) : (
                <ul className="space-y-2">
                  {filteredReviews.map((issue) => (
                    <li
                      key={`${issue.index}-${issue.id}-${issue.html.slice(0, 24)}`}
                      className="border-border/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm font-medium">{issue.description}</p>
                        <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                          #{issue.index} · {issue.id} · {pathLabel}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-amber-500/45 bg-amber-500/10 text-amber-100"
                        >
                          Needs review
                        </Badge>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                            IMPACT_STYLES[issue.impact].badge,
                          )}
                        >
                          {issue.impact}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="jira" className="mt-4 space-y-4 outline-none">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
                  <ClipboardList className="size-4 text-emerald-400" aria-hidden />
                  Jira-ready bug titles (violations + needs review)
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/15 bg-black/30"
                    disabled={filteredJiraCombined.length === 0}
                    onClick={() => {
                      if (filteredJiraCombined.length === 0) return;
                      void copyText(allJiraBugTitles(filteredJiraCombined, scannedUrl), "Copied filtered titles");
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    Copy shown
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/15 bg-black/30"
                    disabled={allIssuesForJira.length === 0}
                    onClick={copyAllJira}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    Copy all
                  </Button>
                </div>
              </div>
              {filteredJiraCombined.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">Nothing to show for this filter.</p>
              ) : (
                <ul className="space-y-3">
                  {filteredJiraCombined.map((issue) => {
                    const title = jiraBugReportTitle(issue, scannedUrl);
                    const open = previewIndex === issue.index;
                    return (
                      <li
                        key={`jira-${issue.index}-${issue.id}`}
                        className="border-border/50 rounded-xl border border-white/[0.06] bg-gradient-to-br from-black/40 to-black/20 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <p className="text-foreground min-w-0 flex-1 text-sm leading-snug font-medium">{title}</p>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {issue.kind === "needs_review" ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/45 bg-amber-500/10 text-amber-100"
                              >
                                Needs review
                              </Badge>
                            ) : null}
                            <span
                              className={cn(
                                "self-start rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                                IMPACT_STYLES[issue.impact].badge,
                              )}
                            >
                              {issue.impact}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-1.5 bg-white/10 hover:bg-white/15"
                            onClick={() => void copyText(title, "Copied to clipboard")}
                          >
                            <Copy className="size-3.5" aria-hidden />
                            Copy to clipboard
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-white/15"
                            onClick={() => setPreviewIndex(open ? null : issue.index)}
                          >
                            {open ? "Hide preview" : "Preview"}
                          </Button>
                        </div>
                        {open ? (
                          <div className="border-border/40 mt-3 rounded-lg border bg-black/40 p-3 text-xs">
                            <p className="text-muted-foreground font-mono leading-relaxed break-all">
                              {issue.failureSummary || issue.description}
                            </p>
                            {issue.html ? (
                              <pre className="text-muted-foreground mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono">
                                {issue.html.slice(0, 1200)}
                                {issue.html.length > 1200 ? "…" : ""}
                              </pre>
                            ) : null}
                            {issue.helpUrl ? (
                              <a
                                href={issue.helpUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary mt-2 inline-block text-xs underline-offset-2 hover:underline"
                              >
                                Open rule help
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
