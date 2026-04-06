"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Bot,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  ListChecks,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Ticket,
  Volume2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel, type ChatSendPayload } from "@/components/ChatPanel";
import { FormattedAiText } from "@/components/FormattedAiText";
import { ResultsList, type ImpactFilter } from "@/components/ResultsList";
import { UrlInput } from "@/components/UrlInput";
import { useScanSession } from "@/components/ScanSessionProvider";
import { summarizeIssues, type ScanIssue } from "@/lib/axeScanner";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";
import { exportExplanationPdf, exportIssuesCsv, exportIssuesPdf } from "@/lib/exportReports";
import { extractProfessionalSummary } from "@/lib/formatAiOutput";
import { loadScanHistory, saveScanToHistory, type HistoryEntry } from "@/lib/scanHistory";
import { validateScanUrl } from "@/lib/url";
import {
  buildScanSummarySpeech,
  speakText,
  stopSpeaking,
  summarizeForSpeech,
  type VoiceCommand,
} from "@/lib/voice";

const VoiceAssistant = dynamic(
  () => import("@/components/VoiceAssistant").then((m) => m.VoiceAssistant),
  {
    ssr: false,
    loading: () => (
      <Card className="agent-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="bg-primary/15 text-primary flex size-9 items-center justify-center rounded-lg">
              <Bot className="size-5" aria-hidden />
            </span>
            Voice agent
          </CardTitle>
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
  const { setScanResults, clearScan } = useScanSession();
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
  const [chatResetKey, setChatResetKey] = useState(0);
  const [voiceSendTrigger, setVoiceSendTrigger] = useState<{ id: number; text: string } | null>(null);

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

  const filteredIssueCount = useMemo(() => {
    if (filter === "all") return issues.length;
    return issues.filter((i) => i.impact === filter).length;
  }, [issues, filter]);

  const filterExportSubtitle = useMemo(() => {
    if (filter === "all") return "All severities";
    return `${filter.charAt(0).toUpperCase() + filter.slice(1)} only`;
  }, [filter]);

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
      const finalUrl = data.scannedUrl ?? v.url;
      setScannedUrl(finalUrl);
      setScanResults(finalUrl, list);
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
  }, [url, refreshHistory, setScanResults]);

  const handleReset = useCallback(() => {
    clearScan();
    stopSpeaking();
    setUrl("https://dequeuniversity.com/demo/mars/");
    setScannedUrl(null);
    setIssues([]);
    setScanLoading(false);
    setScanError(null);
    setFilter("all");
    setSelected(null);
    setExplanation(null);
    setExplainModel(null);
    setExplainLoading(false);
    setExplainError(null);
    setExplainingIndex(null);
    setVoiceStatus("Session reset.");
    setVoiceSendTrigger(null);
    setChatResetKey((k) => k + 1);
  }, [clearScan]);

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
      if (cmd.type === "filter_all") {
        setFilter("all");
        setVoiceStatus("Showing all issues.");
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
      if (cmd.type === "chat_explain_scan") {
        if (!scannedUrl || issues.length === 0) {
          setVoiceStatus("Run a scan first, then ask to explain the issues.");
          return;
        }
        setVoiceSendTrigger({
          id: Date.now(),
          text: "Summarize the accessibility issues found in this scan in plain language. Group by severity, mention key WCAG rule IDs from the scan, and give practical next steps for a developer.",
        });
        setVoiceStatus("Sent scan overview to AI chat.");
        return;
      }
      if (cmd.type === "speak_scan_summary") {
        if (!scannedUrl || issues.length === 0) {
          setVoiceStatus("No results to read. Run a scan first.");
          return;
        }
        const s = summarizeIssues(issues);
        speakText(
          buildScanSummarySpeech({
            scannedUrl: scannedUrl ?? undefined,
            total: s.total,
            byImpact: s.byImpact as Record<string, number>,
            topRules: s.topRules,
          }),
        );
        setVoiceStatus("Reading a short summary of the results.");
        return;
      }
      setVoiceStatus("Command not recognized. Try scan, explain issue 1, explain the issues, or read the results.");
    },
    [issues, runExplain, runScan, scannedUrl, selected],
  );

  const sendChat = useCallback(async (payload: ChatSendPayload) => {
    const issue = payload.issueFocus;
    const data = await postAppJson<{ reply?: string }>("/api/chat", {
      messages: payload.messages,
      scanSummary: payload.scanSummary ?? undefined,
      issueFocus: issue
        ? {
            index: issue.index,
            id: issue.id,
            impact: issue.impact,
            description: issue.description.slice(0, 4000),
            helpUrl: issue.helpUrl,
          }
        : undefined,
      explanationContext: payload.explanationContext ?? undefined,
    });
    return typeof data.reply === "string" ? data.reply : "";
  }, []);

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
    <div className="agent-screen min-h-full">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:ring-2"
      >
        Skip to main content
      </a>
      <header className="agent-header-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-start gap-4">
            <div className="from-primary/30 to-primary/5 border-primary/20 flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br shadow-lg shadow-primary/10">
              <LayoutDashboard className="text-primary size-8" aria-hidden />
            </div>
            <div>
              <p className="text-primary mb-0.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                <Sparkles className="size-3.5" aria-hidden />
                WCAG · Voice · AI
              </p>
              <h1 className="agent-title-gradient text-3xl font-bold tracking-tight md:text-4xl">
                Accessibility AI Agent
              </h1>
              <p className="text-muted-foreground mt-1 max-w-xl text-sm leading-relaxed">
                Scan any public page, review findings by severity, get structured AI explanations, and chat or dictate
                follow-ups—all in one workspace.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" className="gap-2 shadow-md" onClick={handleReset}>
              <RotateCcw className="size-4" aria-hidden />
              Reset workspace
            </Button>
            <Link
              href="/testing"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 border-white/15 bg-card/50")}
            >
              <BookOpen className="size-4" aria-hidden />
              Testing hub
            </Link>
            <Link
              href="https://www.w3.org/WAI/standards-guidelines/wcag/"
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 border-white/15 bg-card/50")}
            >
              <ExternalLink className="size-4" aria-hidden />
              WCAG
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-7xl space-y-8 px-4 py-10">
        <Card className="agent-card overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-gradient-to-r from-primary/12 via-transparent to-violet-500/10">
            <div className="flex flex-wrap items-start gap-3">
              <div className="bg-primary/20 flex size-11 shrink-0 items-center justify-center rounded-xl">
                <ScanSearch className="text-primary size-6" aria-hidden />
              </div>
              <div>
                <CardTitle className="text-xl">Target &amp; scan</CardTitle>
                <CardDescription className="text-muted-foreground mt-1 max-w-2xl text-sm">
                  The agent loads your URL in headless Chromium, runs axe-core, and returns{" "}
                  <strong className="text-foreground font-medium">every</strong> violation it detects—normalized for AI,
                  exports, and the testing hub—not a single-issue sample.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <UrlInput url={url} onUrlChange={setUrl} onScan={() => void runScan()} loading={scanLoading} />
            {scanError ? (
              <Alert variant="destructive">
                <AlertTitle>Scan error</AlertTitle>
                <AlertDescription>{scanError}</AlertDescription>
              </Alert>
            ) : null}
            {history.length > 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                  <History className="text-primary size-4" aria-hidden />
                  Recent targets (saved locally)
                </p>
                <ul className="flex flex-wrap gap-2">
                  {history.slice(0, 6).map((h) => (
                    <li key={h.id}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="max-w-[240px] gap-1.5 truncate border border-white/5 shadow-sm"
                        title={h.scannedUrl}
                        onClick={() => {
                          setUrl(h.scannedUrl);
                          setVoiceStatus("URL restored from history. Run scan to refresh results.");
                        }}
                      >
                        <History className="size-3.5 shrink-0 opacity-70" aria-hidden />
                        {h.scannedUrl.replace(/^https?:\/\//, "")} · {h.totalIssues}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2" aria-labelledby="results-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="bg-primary/15 flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <ListChecks className="text-primary size-5" aria-hidden />
                </div>
                <div>
                  <h2 id="results-heading" className="text-xl font-semibold tracking-tight">
                    Findings
                  </h2>
                  {issues.length > 0 ? (
                    <p className="text-muted-foreground text-xs">
                      Filter: <strong>{filterExportSubtitle}</strong> · {filteredIssueCount} issue
                      {filteredIssueCount === 1 ? "" : "s"} in exports ·{" "}
                      <Link href="/testing" className="text-primary font-medium underline-offset-2 hover:underline">
                        POUR / methods / checkpoints
                      </Link>
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">Run a scan to populate this board.</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-white/10 bg-card/40"
                  disabled={!scannedUrl || issues.length === 0 || filteredIssueCount === 0}
                  onClick={() => scannedUrl && exportIssuesPdf(scannedUrl, issues, filter)}
                >
                  <FileDown className="size-4" aria-hidden />
                  PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-white/10 bg-card/40"
                  disabled={!scannedUrl || issues.length === 0 || filteredIssueCount === 0}
                  onClick={() => scannedUrl && exportIssuesCsv(scannedUrl, issues, filter)}
                >
                  <FileSpreadsheet className="size-4" aria-hidden />
                  CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-white/10 bg-card/40"
                  disabled={!selected}
                  onClick={() => void jiraMock()}
                >
                  <Ticket className="size-4" aria-hidden />
                  Jira
                </Button>
              </div>
            </div>
            {scanLoading ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading scan results">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : issues.length === 0 ? (
              <div className="text-muted-foreground border-border/60 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-16 text-center">
                <ScanSearch className="size-12 opacity-25" aria-hidden />
                <p className="max-w-sm text-sm">No findings yet. Enter a URL above and run a scan to see issues here.</p>
              </div>
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

            <Card id="ai-explanation-section" className="agent-card">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex gap-3">
                    <div className="bg-amber-500/15 flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <Sparkles className="size-5 text-amber-400" aria-hidden />
                    </div>
                    <div>
                      <CardTitle className="text-base">AI explanation</CardTitle>
                      {explainModel ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">Model · {explainModel}</p>
                      ) : (
                        <p className="text-muted-foreground mt-0.5 text-xs">Structured fix guidance &amp; QA tables</p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 border-white/10 bg-card/40"
                    disabled={!explanation}
                    onClick={() =>
                      exportExplanationPdf({
                        scannedUrl,
                        issue: selected,
                        explanation: explanation ?? "",
                      })
                    }
                  >
                    <FileDown className="size-4" aria-hidden />
                    Export PDF
                  </Button>
                </div>
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
                  <div className="max-h-[min(50vh,480px)] overflow-y-auto overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-4">
                    <FormattedAiText text={explanation} />
                  </div>
                ) : (
                  !explainLoading && (
                    <p className="text-muted-foreground text-sm">Select an issue and choose Explain with AI.</p>
                  )
                )}
                {explanation && selected ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => speakText(summarizeForSpeech(explanation, selected))}
                    >
                      <Volume2 className="size-3.5" aria-hidden />
                      Read opening
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => speakText(extractProfessionalSummary(explanation))}
                    >
                      <Sparkles className="size-3.5 text-amber-400" aria-hidden />
                      Speak summary
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Separator className="bg-gradient-to-r from-transparent via-white/15 to-transparent" />

            <ChatPanel
              key={chatResetKey}
              scanSummary={scanSummary}
              selectedIssue={selected}
              explanationText={explanation}
              onSend={sendChat}
              voiceSendTrigger={voiceSendTrigger}
            />
          </aside>
        </div>
      </main>

      <footer className="text-muted-foreground border-t border-white/10 bg-card/30 px-4 py-8 text-center text-xs backdrop-blur-sm">
        <p className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <Bot className="text-primary size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-foreground">Accessibility AI Agent</strong> · Voice uses the Web Speech API · Scans
            use headless Chromium on the server.
          </span>
        </p>
        <p className="mt-3 text-[11px] opacity-90">
          AI keys:{" "}
          <code className="bg-muted/80 rounded px-1.5 py-0.5">GEMINI_API_KEY</code>,{" "}
          <code className="bg-muted/80 rounded px-1.5 py-0.5">ANTHROPIC_API_KEY</code>, or{" "}
          <code className="bg-muted/80 rounded px-1.5 py-0.5">ASSEMBLYAI_API_KEY</code> · optional{" "}
          <code className="bg-muted/80 rounded px-1.5 py-0.5">LLM_PROVIDER=gemini</code>
        </p>
      </footer>

      <div className="sr-only" aria-live="polite">
        {voiceStatus}
      </div>
    </div>
  );
}
