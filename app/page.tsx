"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FileDown, Ticket } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel } from "@/components/ChatPanel";
import { ResultsList, type ImpactFilter } from "@/components/ResultsList";
import { UrlInput } from "@/components/UrlInput";
import type { ChatMessage } from "@/lib/aiClient";
import { summarizeIssues, type ScanIssue } from "@/lib/axeScanner";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";
import { exportScanPdf } from "@/lib/exportPdf";
import { loadScanHistory, saveScanToHistory, type HistoryEntry } from "@/lib/scanHistory";
import { validateScanUrl } from "@/lib/url";
import { speakText, summarizeForSpeech, type VoiceCommand } from "@/lib/voice";

const VoiceAssistant = dynamic(
  () => import("@/components/VoiceAssistant").then((m) => m.VoiceAssistant),
  {
    ssr: false,
    loading: () => (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Voice assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading voice features…</p>
        </CardContent>
      </Card>
    ),
  },
);

type ScanSummary = {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
};

export default function Home() {
  const [url, setUrl] = useState("https://dequeuniversity.com/demo/mars/");
  const [scannedUrl, setScannedUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ImpactFilter>("all");
  const [selected, setSelected] = useState<ScanIssue | null>(null);

  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainModel, setExplainModel] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainingIndex, setExplainingIndex] = useState<number | null>(null);

  const [voiceStatus, setVoiceStatus] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const scanSummary: ScanSummary | null = useMemo(() => {
    if (!scannedUrl || issues.length === 0) return null;
    const s = summarizeIssues(issues);
    return {
      scannedUrl,
      total: s.total,
      byImpact: s.byImpact as Record<string, number>,
      topRules: s.topRules,
    };
  }, [scannedUrl, issues]);

  const refreshHistory = useCallback(() => {
    setHistory(loadScanHistory());
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const runScan = useCallback(async () => {
    const v = validateScanUrl(url);
    if (!v.ok) {
      setScanError(v.error);
      setVoiceStatus(v.error);
      return;
    }
    setScanError(null);
    setScanLoading(true);
    setExplanation(null);
    setExplainModel(null);
    setExplainError(null);
    setSelected(null);
    setVoiceStatus("Scan started.");
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
      const list = data.issues ?? [];
      setIssues(list);
      setScannedUrl(data.scannedUrl ?? v.url);
      setVoiceStatus(`Scan complete. Found ${list.length} issues.`);
      const s = summarizeIssues(list);
      saveScanToHistory({
        scannedUrl: data.scannedUrl ?? v.url,
        totalIssues: list.length,
        byImpact: s.byImpact as Record<string, number>,
        issuesSample: list.slice(0, 20).map((i) => ({
          id: i.id,
          impact: i.impact,
          description: i.description,
        })),
      });
      refreshHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setScanError(msg);
      setVoiceStatus(msg);
    } finally {
      setScanLoading(false);
    }
  }, [url, refreshHistory]);

  const runExplain = useCallback(
    async (issue: ScanIssue, withSpeech?: boolean) => {
      setExplainError(null);
      setExplanation(null);
      setExplainModel(null);
      setExplainingIndex(issue.index);
      setExplainLoading(true);
      setSelected(issue);
      setVoiceStatus(`Explaining issue ${issue.index}.`);
      try {
        const data = await postAppJson<{ explanation?: string; model?: string }>(
          "/api/ai-explain",
          { issue: sanitizeIssueForApi(issue) },
        );
        const text = data.explanation ?? "";
        setExplanation(text);
        setExplainModel(typeof data.model === "string" ? data.model : null);
        if (withSpeech) {
          speakText(summarizeForSpeech(text, issue));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Explanation failed";
        setExplainError(msg);
        setVoiceStatus(msg);
      } finally {
        setExplainLoading(false);
        setExplainingIndex(null);
      }
    },
    [],
  );

  const handleVoice = useCallback(
    (cmd: VoiceCommand) => {
      if (cmd.type === "scan") {
        void runScan();
        return;
      }
      if (cmd.type === "filter_critical") {
        setFilter("critical");
        setVoiceStatus("Filter set to critical.");
        return;
      }
      if (cmd.type === "explain_issue") {
        const issue = issues.find((i) => i.index === cmd.index);
        if (!issue) {
          setVoiceStatus(`No issue number ${cmd.index}.`);
          return;
        }
        void runExplain(issue, true);
        return;
      }
      if (cmd.type === "how_to_fix") {
        if (!selected) {
          setVoiceStatus("Select an issue first, or say explain issue followed by a number.");
          return;
        }
        void runExplain(selected, true);
        return;
      }
      setVoiceStatus("Command not recognized. Try scan, explain issue 1, or show critical issues.");
    },
    [issues, runExplain, runScan, selected],
  );

  const sendChat = useCallback(
    async (messages: ChatMessage[]) => {
      const data = await postAppJson<{ reply?: string }>("/api/chat", {
        messages,
        scanSummary: scanSummary ?? undefined,
      });
      return typeof data.reply === "string" ? data.reply : "";
    },
    [scanSummary],
  );

  const jiraMock = useCallback(async () => {
    if (!selected || !scannedUrl) return;
    await fetch("/api/jira-mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `[A11y] ${selected.id}`,
        description: selected.description,
        url: scannedUrl,
        impact: selected.impact,
        html: selected.html,
      }),
    });
    setVoiceStatus("Mock Jira ticket logged (see server console).");
  }, [selected, scannedUrl]);

  return (
    <div className="bg-background min-h-full">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:ring-2"
      >
        Skip to main content
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Accessibility AI Scanner</h1>
            <p className="text-muted-foreground text-sm">
              WCAG-oriented scans with Claude explanations, QA steps, and voice control.
            </p>
          </div>
          <Link
            href="https://www.w3.org/WAI/standards-guidelines/wcag/"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            WCAG overview
          </Link>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UrlInput url={url} onUrlChange={setUrl} onScan={() => void runScan()} loading={scanLoading} />
            {scanError ? (
              <Alert variant="destructive">
                <AlertTitle>Scan error</AlertTitle>
                <AlertDescription>{scanError}</AlertDescription>
              </Alert>
            ) : null}
            {history.length > 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm font-medium">Recent scans (local)</p>
                <ul className="flex flex-wrap gap-2">
                  {history.slice(0, 6).map((h) => (
                    <li key={h.id}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="max-w-[220px] truncate"
                        title={h.scannedUrl}
                        onClick={() => {
                          setUrl(h.scannedUrl);
                          setVoiceStatus("URL restored from history. Run scan to refresh results.");
                        }}
                      >
                        {h.scannedUrl.replace(/^https?:\/\//, "")} · {h.totalIssues}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2" aria-labelledby="results-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="results-heading" className="text-lg font-semibold">
                Results
              </h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!scannedUrl || issues.length === 0}
                  onClick={() => scannedUrl && exportScanPdf(scannedUrl, issues)}
                >
                  <FileDown className="mr-1 size-4" aria-hidden />
                  Export PDF
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!selected} onClick={() => void jiraMock()}>
                  <Ticket className="mr-1 size-4" aria-hidden />
                  Jira (mock)
                </Button>
              </div>
            </div>
            {scanLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading scan results">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : issues.length === 0 ? (
              <p className="text-muted-foreground text-sm">Run a scan to see accessibility issues here.</p>
            ) : (
              <ResultsList
                issues={issues}
                filter={filter}
                onFilterChange={setFilter}
                selected={selected}
                onSelect={setSelected}
                onExplain={(issue) => void runExplain(issue)}
                explainingId={explainingIndex}
              />
            )}
          </section>

          <aside className="space-y-4" aria-label="AI and voice panels">
            <VoiceAssistant onCommand={handleVoice} />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">AI explanation</CardTitle>
                {explainModel ? (
                  <p className="text-muted-foreground text-xs">Model: {explainModel}</p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {explainLoading ? (
                  <div className="space-y-2" aria-busy="true">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : null}
                {explainError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Explanation error</AlertTitle>
                    <AlertDescription>{explainError}</AlertDescription>
                  </Alert>
                ) : null}
                {explanation ? (
                  <div className="prose prose-invert max-w-none text-sm">
                    <pre className="text-foreground font-sans whitespace-pre-wrap">{explanation}</pre>
                  </div>
                ) : (
                  !explainLoading && (
                    <p className="text-muted-foreground text-sm">Select an issue and choose Explain with AI.</p>
                  )
                )}
                {explanation && selected ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => speakText(summarizeForSpeech(explanation, selected))}>
                    Read summary aloud
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Separator />

            <ChatPanel scanSummary={scanSummary} onSend={sendChat} />
          </aside>
        </div>
      </main>

      <footer className="text-muted-foreground border-t px-4 py-6 text-center text-xs">
        Voice uses the Web Speech API. Scans run server-side with headless Chromium. Set{" "}
        <code className="bg-muted rounded px-1">GEMINI_API_KEY</code>,{" "}
        <code className="bg-muted rounded px-1">ANTHROPIC_API_KEY</code>, or{" "}
        <code className="bg-muted rounded px-1">ASSEMBLYAI_API_KEY</code> for AI (set{" "}
        <code className="bg-muted rounded px-1">LLM_PROVIDER=gemini</code> to force Gemini).
      </footer>

      <div className="sr-only" aria-live="polite">
        {voiceStatus}
      </div>
    </div>
  );
}
