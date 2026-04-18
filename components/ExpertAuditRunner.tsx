"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { ProfessionalReportText } from "@/components/ProfessionalReportText";
import { UrlInput } from "@/components/UrlInput";
import { useScanSession } from "@/components/ScanSessionProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanIssue } from "@/lib/axeScanner";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";
import { exportTestingHubReportPdf } from "@/lib/exportReports";
import {
  parseExpertAuditTickets,
  type ExpertJiraTicket,
} from "@/lib/expertAuditSchema";
import type {
  ExpertAuditOutputFormat,
  ExpertAuditPriority,
} from "@/lib/testingAnalysisPrompts";
import { validateScanUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

type Props = {
  fieldId: string;
  defaultUrl?: string;
  cardAccent?: string;
};

type Phase = "idle" | "scanning" | "analyzing";

type JiraResult = {
  index: number;
  summary: string;
  ok: boolean;
  key?: string;
  url?: string;
  message: string;
  mock?: boolean;
};

type SegOption<T extends string> = { value: T; label: string; hint?: string };

const PRIORITY_OPTIONS: SegOption<ExpertAuditPriority>[] = [
  { value: "aa", label: "AA only", hint: "WCAG 2.1 / 2.2 Level AA" },
  { value: "aa-aaa", label: "AA + AAA where feasible", hint: "Surface AAA findings only when evidence is clear" },
];

const OUTPUT_OPTIONS: SegOption<ExpertAuditOutputFormat>[] = [
  { value: "markdown", label: "Markdown", hint: "Full audit report" },
  { value: "json", label: "JSON", hint: "Machine-readable findings" },
  { value: "jira", label: "Jira tickets", hint: "Markdown + bulk-create issues" },
];

function Segmented<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const { legend, name, value, options, onChange, disabled } = props;
  return (
    <fieldset className="space-y-2">
      <legend className="text-foreground text-xs font-semibold tracking-wide uppercase">
        {legend}
      </legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="border-border/40 bg-card/40 inline-flex flex-wrap gap-1 rounded-xl border p-1"
      >
        {options.map((opt) => {
          const id = `${name}-${opt.value}`;
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              htmlFor={id}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-primary/15 text-primary border-primary/30 border"
                  : "text-muted-foreground hover:text-foreground border border-transparent",
                disabled && "cursor-not-allowed opacity-60",
              )}
              title={opt.hint}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={opt.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function buildJsonFilename(scannedUrl: string | null): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let host = "audit";
  if (scannedUrl) {
    try {
      host = new URL(scannedUrl).hostname.replace(/[^a-z0-9.-]/gi, "_");
    } catch {
      // ignore — fall back to "audit"
    }
  }
  return `expert-audit_${host}_${stamp}.json`;
}

function downloadText(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extractJsonForDisplay(text: string): string {
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1]?.trim();
    if (inner && (inner.startsWith("{") || inner.startsWith("["))) last = inner;
  }
  if (last) {
    try {
      return JSON.stringify(JSON.parse(last), null, 2);
    } catch {
      return last;
    }
  }
  return text.trim();
}

export function ExpertAuditRunner({
  fieldId,
  defaultUrl = "",
  cardAccent = "from-rose-500/12 via-card to-slate-950/45",
}: Props) {
  const { setScanResults } = useScanSession();
  const [url, setUrl] = useState(defaultUrl);
  const [priority, setPriority] = useState<ExpertAuditPriority>("aa");
  const [outputFormat, setOutputFormat] = useState<ExpertAuditOutputFormat>("markdown");

  const [localScannedUrl, setLocalScannedUrl] = useState<string | null>(null);
  const [localIssues, setLocalIssues] = useState<ScanIssue[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [resolvedFormat, setResolvedFormat] = useState<ExpertAuditOutputFormat>("markdown");
  const [model, setModel] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [jiraPosting, setJiraPosting] = useState(false);
  const [jiraResults, setJiraResults] = useState<JiraResult[]>([]);
  const [jiraError, setJiraError] = useState<string | null>(null);

  const busy = phase !== "idle";

  const tickets: ExpertJiraTicket[] = useMemo(
    () => (analysis && resolvedFormat === "jira" ? parseExpertAuditTickets(analysis) : []),
    [analysis, resolvedFormat],
  );

  const jsonForDisplay = useMemo(
    () => (analysis && resolvedFormat === "json" ? extractJsonForDisplay(analysis) : ""),
    [analysis, resolvedFormat],
  );

  const runScanAndAnalyze = useCallback(async () => {
    const v = validateScanUrl(url);
    if (!v.ok) {
      setScanError(v.error);
      return;
    }
    setScanError(null);
    setAnalysisError(null);
    setAnalysis(null);
    setModel(null);
    setJiraResults([]);
    setJiraError(null);

    let list: ScanIssue[] = [];
    let finalUrl = v.url;

    setPhase("scanning");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v.url }),
      });
      const data = (await res.json()) as {
        error?: string;
        issues?: ScanIssue[];
        reviewIssues?: ScanIssue[];
        scannedUrl?: string;
      };
      if (!res.ok) throw new Error(data.error || "Scan failed");
      list = data.issues ?? [];
      const reviewList = data.reviewIssues ?? [];
      finalUrl = data.scannedUrl ?? v.url;
      setLocalIssues(list);
      setLocalScannedUrl(finalUrl);
      setScanResults(finalUrl, list, reviewList);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setScanError(msg);
      setPhase("idle");
      return;
    }

    setPhase("analyzing");
    try {
      const data = await postAppJson<{
        analysis?: string;
        model?: string;
        outputFormat?: ExpertAuditOutputFormat;
      }>(
        "/api/ai-testing-analysis",
        {
          scannedUrl: finalUrl,
          mode: "expert-audit",
          priority,
          outputFormat,
          issues: list.map(sanitizeIssueForApi),
        },
        { timeoutMs: 240_000 },
      );
      setAnalysis(typeof data.analysis === "string" ? data.analysis : "");
      setModel(typeof data.model === "string" ? data.model : null);
      setResolvedFormat(
        data.outputFormat === "json" || data.outputFormat === "jira"
          ? data.outputFormat
          : "markdown",
      );
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setPhase("idle");
    }
  }, [url, priority, outputFormat, setScanResults]);

  const resetPanel = useCallback(() => {
    if (busy) return;
    setUrl(defaultUrl);
    setPriority("aa");
    setOutputFormat("markdown");
    setLocalScannedUrl(null);
    setLocalIssues([]);
    setAnalysis(null);
    setResolvedFormat("markdown");
    setModel(null);
    setScanError(null);
    setAnalysisError(null);
    setJiraResults([]);
    setJiraError(null);
  }, [busy, defaultUrl]);

  const createJiraIssues = useCallback(async () => {
    if (!localScannedUrl || tickets.length === 0) return;
    setJiraPosting(true);
    setJiraError(null);
    setJiraResults([]);
    const out: JiraResult[] = [];
    for (let i = 0; i < tickets.length; i += 1) {
      const t = tickets[i];
      try {
        const res = await fetch("/api/jira-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: t.summary,
            description: t.description,
            url: localScannedUrl,
            impact: t.impact,
            html: t.html,
            issueIndex: i + 1,
            helpUrl: t.helpUrl,
            sourceUrl: localScannedUrl,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          key?: string;
          url?: string;
          message?: string;
          mock?: boolean;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || `Jira request failed (${res.status})`);
        out.push({
          index: i + 1,
          summary: t.summary,
          ok: true,
          key: data.key,
          url: data.url,
          message: data.url
            ? `${data.mock ? "Logged (mock)" : "Created"} ${data.key ?? ""}`
            : (data.message ?? "Submitted"),
          mock: data.mock,
        });
      } catch (e) {
        out.push({
          index: i + 1,
          summary: t.summary,
          ok: false,
          message: e instanceof Error ? e.message : "Jira failed",
        });
      }
      setJiraResults([...out]);
    }
    setJiraPosting(false);
    const failed = out.filter((r) => !r.ok).length;
    if (failed === out.length && out.length > 0) {
      setJiraError(`All ${out.length} Jira requests failed.`);
    } else if (failed > 0) {
      setJiraError(`${failed} of ${out.length} Jira requests failed.`);
    }
  }, [tickets, localScannedUrl]);

  return (
    <Card
      className={cn(
        "agent-card mt-2 overflow-hidden border-white/10 shadow-xl",
        "bg-gradient-to-br",
        cardAccent,
      )}
    >
      <CardHeader className="border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="bg-primary/15 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-inner">
              <ClipboardCheck className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg">Expert WCAG audit</CardTitle>
              <CardDescription className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
                Scan the page, then generate a senior-QA / CPACC-style audit with severity ratings, before/after fix
                snippets, technique IDs, and your choice of Markdown, JSON, or Jira-ready output.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <UrlInput
          url={url}
          onUrlChange={setUrl}
          onScan={() => {}}
          loading={phase === "scanning"}
          fieldId={fieldId}
          showScanButton={false}
          showHint={false}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Segmented
            legend="Priority"
            name="expert-priority"
            value={priority}
            options={PRIORITY_OPTIONS}
            onChange={setPriority}
            disabled={busy}
          />
          <Segmented
            legend="Output format"
            name="expert-output"
            value={outputFormat}
            options={OUTPUT_OPTIONS}
            onChange={setOutputFormat}
            disabled={busy}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            className="shadow-primary/15 gap-2 shadow-lg"
            disabled={busy || !url.trim()}
            onClick={() => void runScanAndAnalyze()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {phase === "scanning" ? "Scanning page…" : "Generating audit…"}
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                Scan URL &amp; run expert audit
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="bg-card/50 gap-2 border-white/15"
            disabled={busy}
            onClick={resetPanel}
            aria-label="Reset URL, options, and last result"
          >
            <RotateCcw className="size-4" aria-hidden />
            Reset
          </Button>
          {localScannedUrl && !busy ? (
            <p className="text-muted-foreground flex min-h-11 items-center text-xs">
              Last run:{" "}
              <span className="text-foreground ml-1 max-w-[200px] truncate font-mono">
                {localScannedUrl}
              </span>
              {" · "}
              {localIssues.length} finding{localIssues.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {scanError ? (
          <Alert variant="destructive">
            <AlertTitle>Scan error</AlertTitle>
            <AlertDescription>{scanError}</AlertDescription>
          </Alert>
        ) : null}

        {phase === "analyzing" ? (
          <div
            className="border-border/50 border-primary/20 bg-primary/5 flex items-start gap-4 rounded-2xl border p-5"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="text-primary mt-0.5 size-8 shrink-0 animate-spin" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-foreground font-medium">Generating expert audit…</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                The model is reasoning through every WCAG criterion. Expert mode can take 1–3 minutes.
              </p>
            </div>
          </div>
        ) : null}

        {analysisError ? (
          <Alert variant="destructive">
            <AlertTitle>Audit error</AlertTitle>
            <AlertDescription>{analysisError}</AlertDescription>
          </Alert>
        ) : null}

        {analysis && resolvedFormat === "markdown" && localScannedUrl ? (
          <ReportBlock
            title="Expert WCAG audit"
            mode="expert-audit"
            scannedUrl={localScannedUrl}
            issueCount={localIssues.length}
            model={model}
            body={analysis}
          />
        ) : null}

        {analysis && resolvedFormat === "json" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {model ? (
                <p className="text-muted-foreground text-xs">
                  Model · <span className="text-foreground/80">{model}</span>
                </p>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-card/50 gap-2 border-white/15"
                onClick={() => downloadText(buildJsonFilename(localScannedUrl), jsonForDisplay)}
              >
                <Download className="size-4" aria-hidden />
                Download JSON
              </Button>
            </div>
            <pre
              className="border-border/50 from-muted/20 to-card/80 overflow-x-auto rounded-2xl border bg-gradient-to-b p-5 text-xs leading-relaxed shadow-inner"
              aria-label="Expert audit JSON output"
            >
              <code>{jsonForDisplay}</code>
            </pre>
          </div>
        ) : null}

        {analysis && resolvedFormat === "jira" && localScannedUrl ? (
          <div className="space-y-5">
            <ReportBlock
              title="Expert WCAG audit"
              mode="expert-audit"
              scannedUrl={localScannedUrl}
              issueCount={localIssues.length}
              model={model}
              body={analysis}
            />
            <div
              className="border-border/50 from-card/80 to-card/40 space-y-4 rounded-2xl border bg-gradient-to-b p-5"
              role="region"
              aria-label="Jira ticket actions"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-foreground text-sm font-semibold">
                    {tickets.length === 0
                      ? "No Jira tickets parsed"
                      : `Ready to create ${tickets.length} Jira ${tickets.length === 1 ? "issue" : "issues"}`}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Uses the existing Jira integration. If credentials are unset, requests run in mock mode.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  disabled={jiraPosting || tickets.length === 0}
                  onClick={() => void createJiraIssues()}
                >
                  {jiraPosting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="size-4" aria-hidden />
                      Create {tickets.length || ""} Jira{" "}
                      {tickets.length === 1 ? "issue" : "issues"}
                    </>
                  )}
                </Button>
              </div>

              {jiraError ? (
                <Alert variant="destructive">
                  <AlertTitle>Jira</AlertTitle>
                  <AlertDescription>{jiraError}</AlertDescription>
                </Alert>
              ) : null}

              {jiraResults.length > 0 ? (
                <ul className="space-y-2">
                  {jiraResults.map((r) => (
                    <li
                      key={r.index}
                      className={cn(
                        "border-border/40 bg-card/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs",
                        !r.ok && "border-destructive/40",
                      )}
                    >
                      <span className="text-foreground min-w-0 flex-1 truncate">
                        <span className="text-muted-foreground mr-2 font-mono">#{r.index}</span>
                        {r.summary}
                      </span>
                      {r.ok ? (
                        r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                          >
                            {r.message}
                            <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-emerald-400">{r.message}</span>
                        )
                      ) : (
                        <span className="text-destructive">{r.message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReportBlock(props: {
  title: string;
  mode: string;
  scannedUrl: string;
  issueCount: number;
  model: string | null;
  body: string;
}) {
  const { title, mode, scannedUrl, issueCount, model, body } = props;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {model ? (
          <p className="text-muted-foreground text-xs">
            Model · <span className="text-foreground/80">{model}</span>
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-card/50 gap-2 border-white/15"
          onClick={() =>
            exportTestingHubReportPdf({
              reportTitle: title,
              mode,
              scannedUrl,
              issueCount,
              model,
              body,
            })
          }
        >
          <FileDown className="size-4" aria-hidden />
          Export PDF
        </Button>
      </div>
      <div
        className="border-border/50 from-muted/20 to-card/80 rounded-2xl border bg-gradient-to-b p-6 shadow-inner"
        role="region"
        aria-label="Expert WCAG audit report"
      >
        <ProfessionalReportText text={body} dedupe />
      </div>
    </div>
  );
}
