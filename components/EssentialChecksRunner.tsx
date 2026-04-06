"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  HelpCircle,
  Loader2,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import { UrlInput } from "@/components/UrlInput";
import { useScanSession } from "@/components/ScanSessionProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  axeIncompleteReviewCount,
  type AxeOverviewStats,
  type ImpactLevel,
  type ScanIssue,
} from "@/lib/axeScanner";
import { complianceRiskFromCounts } from "@/lib/complianceRisk";
import { allJiraBugTitles, jiraBugReportTitle, pagePathFromScannedUrl } from "@/lib/jiraBugTitle";
import { WCAG_PRESET_OPTIONS, type WcagPresetId } from "@/lib/wcagAxeTags";
import { validateScanUrl } from "@/lib/url";
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
): string {
  const shortUrl = scannedUrl.length > 72 ? `${scannedUrl.slice(0, 69)}…` : scannedUrl;
  return `Accessibility scan for ${shortUrl} (${wcagLabel}). The automated check found ${violationInstances} issue instance${violationInstances === 1 ? "" : "s"} and ${passRules} rule${passRules === 1 ? "" : "s"} that passed. ${summary}`;
}

export function EssentialChecksRunner({ fieldId }: { fieldId: string }) {
  const { setScanResults } = useScanSession();
  const [url, setUrl] = useState("");
  const [wcagPreset, setWcagPreset] = useState<WcagPresetId>("wcag21-aa");
  const [deepScan, setDeepScan] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [axeOverview, setAxeOverview] = useState<AxeOverviewStats | null>(null);
  const [wcagLabel, setWcagLabel] = useState<string>(WCAG_PRESET_OPTIONS[2].label);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const runScan = useCallback(async () => {
    const v = validateScanUrl(url);
    if (!v.ok) {
      setScanError(v.error);
      return;
    }
    setScanError(null);
    setCopyHint(null);
    setPreviewIndex(null);
    setScanning(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: v.url,
          wcagPreset,
          deepScan,
          includeAxeOverview: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        issues?: ScanIssue[];
        scannedUrl?: string;
        axeOverview?: AxeOverviewStats;
        meta?: { wcagPreset?: WcagPresetId };
      };
      if (!res.ok) {
        throw new Error(data.error || "Scan failed");
      }
      const list = data.issues ?? [];
      const finalUrl = data.scannedUrl ?? v.url;
      setIssues(list);
      setScannedUrl(finalUrl);
      setAxeOverview(data.axeOverview ?? null);
      const preset = data.meta?.wcagPreset ?? wcagPreset;
      const label = WCAG_PRESET_OPTIONS.find((o) => o.id === preset)?.label ?? wcagLabel;
      setWcagLabel(label.replace(/\s*\(Recommended\)\s*/i, "").trim());
      setScanResults(finalUrl, list);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Scan failed");
      setIssues([]);
      setScannedUrl(null);
      setAxeOverview(null);
    } finally {
      setScanning(false);
    }
  }, [url, wcagPreset, deepScan, setScanResults, wcagLabel]);

  const reset = useCallback(() => {
    if (scanning) return;
    setUrl("");
    setScannedUrl(null);
    setIssues([]);
    setAxeOverview(null);
    setScanError(null);
    setCopyHint(null);
    setPreviewIndex(null);
  }, [scanning]);

  const passRules = axeOverview?.passRules ?? 0;
  const needsReview = axeIncompleteReviewCount(axeOverview);
  const byImpact: Record<ImpactLevel, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const i of issues) {
    byImpact[i.impact]++;
  }
  const summary = complianceRiskFromCounts(byImpact, needsReview);
  const pathLabel = scannedUrl ? pagePathFromScannedUrl(scannedUrl) : "—";

  const copyText = useCallback(async (text: string, hint: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(hint);
      window.setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint("Copy failed — select text manually");
    }
  }, []);

  const copyAllJira = useCallback(() => {
    if (!scannedUrl || issues.length === 0) return;
    void copyText(allJiraBugTitles(issues, scannedUrl), "All Jira titles copied");
  }, [scannedUrl, issues, copyText]);

  return (
    <div className="space-y-6">
      <Card className="agent-card border-white/10 bg-gradient-to-br from-emerald-500/5 via-card to-slate-950/50 shadow-xl">
        <CardContent className="space-y-5 pt-6">
          <div className="space-y-3">
            <UrlInput
              url={url}
              onUrlChange={setUrl}
              onScan={() => {}}
              loading={scanning}
              fieldId={fieldId}
              showScanButton={false}
              showHint={false}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-preset`} className="text-sm font-medium">
                  How strict should the check be?
                </Label>
                <select
                  id={`${fieldId}-preset`}
                  value={wcagPreset}
                  onChange={(e) => setWcagPreset(e.target.value as WcagPresetId)}
                  disabled={scanning}
                  className="border-input focus-visible:ring-ring h-11 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-sm outline-none focus-visible:ring-2"
                >
                  {WCAG_PRESET_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.07] bg-black/25 p-4">
                <input
                  type="checkbox"
                  checked={deepScan}
                  onChange={(e) => setDeepScan(e.target.checked)}
                  disabled={scanning}
                  className="accent-emerald-500 mt-1 size-4 shrink-0 rounded border-white/20"
                />
                <span>
                  <span className="text-sm font-medium text-zinc-100">Thorough single-page pass</span>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    Tabs through the page after load so more controls are included in the check.
                  </p>
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="lg"
              className="gap-2 bg-emerald-600 shadow-lg shadow-emerald-900/25 hover:bg-emerald-500"
              disabled={scanning || !url.trim()}
              onClick={() => void runScan()}
            >
              {scanning ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Scanning…
                </>
              ) : (
                <>
                  <ScanSearch className="size-4" aria-hidden />
                  Run essential checks
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="border-white/15 bg-card/50"
              disabled={scanning}
              onClick={reset}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </Button>
          </div>

          {scanError ? (
            <Alert variant="destructive">
              <AlertTitle>Scan error</AlertTitle>
              <AlertDescription>{scanError}</AlertDescription>
            </Alert>
          ) : null}

          {copyHint ? (
            <p className="text-emerald-400/90 text-sm" role="status">
              {copyHint}
            </p>
          ) : null}
          {scanning ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status" aria-live="polite">
              <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
              Running automated checks…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {scannedUrl ? (
        <div className="space-y-6">
          {/* Overview hero — matches reference: badge + narrative + metrics */}
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
                  Essential checks report
                </span>
                <Badge variant="outline" className="border-white/15 text-muted-foreground text-[10px]">
                  {wcagLabel}
                </Badge>
              </div>
              <p className="text-foreground/95 max-w-4xl text-sm leading-relaxed sm:text-[15px]">
                {buildOverviewParagraph(scannedUrl, wcagLabel, issues.length, passRules, summary)}
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricTile label="Pages scanned" value={1} icon={FileText} iconClass="bg-violet-500/15 text-violet-300" />
                <MetricTile
                  label="Violations"
                  value={issues.length}
                  icon={AlertTriangle}
                  iconClass="bg-orange-500/15 text-orange-400"
                />
                <MetricTile
                  label="Passes"
                  value={passRules}
                  icon={CheckCircle2}
                  iconClass="bg-emerald-500/15 text-emerald-400"
                />
                <MetricTile
                  label="Needs review"
                  value={needsReview}
                  icon={HelpCircle}
                  iconClass="bg-violet-500/15 text-violet-300"
                />
              </div>

              <div>
                <h3 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                  Severity breakdown
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {IMPACT_ORDER.map((level) => (
                    <div
                      key={level}
                      className="border-border/50 rounded-xl border bg-black/25 px-4 py-3"
                    >
                      <p className={cn("text-2xl font-semibold tabular-nums capitalize", IMPACT_STYLES[level].text)}>
                        {byImpact[level]}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs capitalize">{level}</p>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={cn("h-full rounded-full transition-all", IMPACT_STYLES[level].bar)}
                          style={{
                            width: `${issues.length ? Math.min(100, (byImpact[level] / issues.length) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-border/50 rounded-2xl border border-white/10 bg-card/40 p-4 shadow-inner sm:p-6">
            <Tabs defaultValue="jira" className="w-full gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/30 sm:w-auto">
                  <TabsTrigger value="issues" className="gap-1.5">
                    Issues ({issues.length})
                  </TabsTrigger>
                  <TabsTrigger value="jira" className="gap-1.5">
                    Jira bug reports ({issues.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="issues" className="mt-4 space-y-3 outline-none">
                {issues.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No issues reported for this URL with the selected options.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {issues.map((issue) => (
                      <li
                        key={`${issue.index}-${issue.id}-${issue.html.slice(0, 24)}`}
                        className="border-border/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-black/20 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground text-sm font-medium">{issue.description}</p>
                          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                            {issue.id} · {pathLabel}
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

              <TabsContent value="jira" className="mt-4 space-y-4 outline-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
                    <ClipboardList className="size-4 text-emerald-400" aria-hidden />
                    Jira-ready bug titles
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/15 bg-black/30"
                    disabled={issues.length === 0}
                    onClick={copyAllJira}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    Copy all
                  </Button>
                </div>
                {issues.length === 0 ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">Nothing to copy yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {issues.map((issue) => {
                      const title = jiraBugReportTitle(issue, scannedUrl);
                      const open = previewIndex === issue.index;
                      return (
                        <li
                          key={`jira-${issue.index}-${issue.id}`}
                          className="border-border/50 rounded-xl border border-white/[0.06] bg-gradient-to-br from-black/40 to-black/20 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <p className="text-foreground min-w-0 flex-1 text-sm leading-snug font-medium">{title}</p>
                            <span
                              className={cn(
                                "shrink-0 self-start rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                                IMPACT_STYLES[issue.impact].badge,
                              )}
                            >
                              {issue.impact}
                            </span>
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
      ) : null}
    </div>
  );
}
