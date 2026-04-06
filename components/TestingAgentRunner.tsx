"use client";

import { useCallback, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2, Sparkles } from "lucide-react";
import { ProfessionalReportText } from "@/components/ProfessionalReportText";
import { UrlInput } from "@/components/UrlInput";
import { useScanSession } from "@/components/ScanSessionProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanIssue } from "@/lib/axeScanner";
import type { TestingAnalysisMode } from "@/lib/testingAnalysisPrompts";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";
import { validateScanUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

const DEFAULT_TEST_URL = "https://dequeuniversity.com/demo/mars/";

type Props = {
  mode: TestingAnalysisMode;
  title: string;
  description: string;
  icon: LucideIcon;
  fieldId: string;
  defaultUrl?: string;
  /** Card surface gradient (subtle) */
  cardAccent?: string;
};

export function TestingAgentRunner({
  mode,
  title,
  description,
  icon: Icon,
  fieldId,
  defaultUrl = DEFAULT_TEST_URL,
  cardAccent = "from-primary/10 via-card/95 to-card",
}: Props) {
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
              <CardDescription className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
                {description}
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
        />
        <div className="flex flex-wrap gap-3">
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

        {model ? (
          <p className="text-muted-foreground text-xs">
            Model · <span className="text-foreground/80">{model}</span>
          </p>
        ) : null}

        {analysis ? (
          <div
            className="border-border/50 from-muted/20 to-card/80 rounded-2xl border bg-gradient-to-b p-6 shadow-inner"
            role="region"
            aria-label="Accessibility report"
          >
            <ProfessionalReportText text={analysis} dedupe />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
