"use client";

import { useCallback, useState } from "react";
import {
  ClipboardCheck,
  FileDown,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ProfessionalReportText } from "@/components/ProfessionalReportText";
import { UrlInput } from "@/components/UrlInput";
import { useScanSession } from "@/components/ScanSessionProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanIssue } from "@/lib/axeScanner";
import type { TestingAnalysisMode } from "@/lib/testingAnalysisPrompts";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";
import { exportTestingHubReportPdf } from "@/lib/exportReports";
import { validateScanUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

const DEFAULT_TEST_URL = "https://dequeuniversity.com/demo/mars/";

const RUNNER_ICONS = {
  sparkles: Sparkles,
  layers: Layers,
  workflow: Workflow,
  clipboardCheck: ClipboardCheck,
} as const satisfies Record<string, LucideIcon>;

export type TestingRunnerIconKey = keyof typeof RUNNER_ICONS;

type Props = {
  mode: TestingAnalysisMode;
  title: string;
  /** Optional; omit to avoid duplicate copy when the page hero already explains the section. */
  description?: string;
  icon: TestingRunnerIconKey;
  fieldId: string;
  defaultUrl?: string;
  /** Card surface gradient (subtle) */
  cardAccent?: string;
};

export function TestingAgentRunner({
  mode,
  title,
  description,
  icon,
  fieldId,
  defaultUrl = DEFAULT_TEST_URL,
  cardAccent = "from-primary/10 via-card/95 to-card",
}: Props) {
  const Icon = RUNNER_ICONS[icon];
  const { setScanResults } = useScanSession();
  const [url, setUrl] = useState(defaultUrl);
  const [localScannedUrl, setLocalScannedUrl] = useState<string | null>(null);
  const [localIssues, setLocalIssues] = useState<ScanIssue[]>([]);
  const [phase, setPhase] = useState<"idle" | "scanning" | "analyzing">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const busy = phase !== "idle";

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

    let list: ScanIssue[] = [];
    let finalUrl = v.url;

    setPhase("scanning");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v.url }),
      });
      const data = (await res.json()) as { error?: string; issues?: ScanIssue[]; scannedUrl?: string };
      if (!res.ok) {
        throw new Error(data.error || "Scan failed");
      }
      list = data.issues ?? [];
      finalUrl = data.scannedUrl ?? v.url;
      setLocalIssues(list);
      setLocalScannedUrl(finalUrl);
      setScanResults(finalUrl, list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setScanError(msg);
      setPhase("idle");
      return;
    }

    const timeoutMs = mode === "comprehensive" ? 180_000 : 150_000;
    setPhase("analyzing");
    try {
      const aiData = await postAppJson<{ analysis?: string; model?: string }>(
        "/api/ai-testing-analysis",
        {
          scannedUrl: finalUrl,
          mode,
          issues: list.map(sanitizeIssueForApi),
        },
        { timeoutMs },
      );
      setAnalysis(typeof aiData.analysis === "string" ? aiData.analysis : "");
      setModel(typeof aiData.model === "string" ? aiData.model : null);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setPhase("idle");
    }
  }, [url, mode, setScanResults]);

  const resetPanel = useCallback(() => {
    if (busy) return;
    setUrl(defaultUrl);
    setLocalScannedUrl(null);
    setLocalIssues([]);
    setAnalysis(null);
    setModel(null);
    setScanError(null);
    setAnalysisError(null);
  }, [busy, defaultUrl]);

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
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10",
                "bg-primary/15 text-primary shadow-inner",
              )}
            >
              <Icon className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              {description ? (
                <CardDescription className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
                  {description}
                </CardDescription>
              ) : null}
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
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            className="gap-2 shadow-lg shadow-primary/15"
            disabled={busy || !url.trim()}
            onClick={() => void runScanAndAnalyze()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {phase === "scanning" ? "Scanning page…" : "Generating report…"}
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                Scan URL &amp; generate report
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-2 border-white/15 bg-card/50"
            disabled={busy}
            onClick={resetPanel}
            aria-label="Reset URL, last run, and report on this page"
          >
            <RotateCcw className="size-4" aria-hidden />
            Reset
          </Button>
          {localScannedUrl && !busy ? (
            <p className="text-muted-foreground flex min-h-11 items-center text-xs">
              Last run: <span className="text-foreground ml-1 max-w-[200px] truncate font-mono">{localScannedUrl}</span>
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

        {analysisError ? (
          <Alert variant="destructive">
            <AlertTitle>Report error</AlertTitle>
            <AlertDescription>{analysisError}</AlertDescription>
          </Alert>
        ) : null}

        {analysis ? (
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
                className="gap-2 border-white/15 bg-card/50"
                onClick={() =>
                  localScannedUrl &&
                  exportTestingHubReportPdf({
                    reportTitle: title,
                    mode,
                    scannedUrl: localScannedUrl,
                    issueCount: localIssues.length,
                    model,
                    body: analysis,
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
              aria-label="Accessibility report"
            >
              <ProfessionalReportText text={analysis} dedupe />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
