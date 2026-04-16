"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  FileDown,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  Loader2,
  RotateCcw,
  ScanSearch,
  Ticket,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewScanLayout, type NewScanOptions } from "@/components/NewScanLayout";
import { ScanInProgressPanel, type ScanLogLine } from "@/components/ScanInProgressPanel";
import { WhatWeTestPanel } from "@/components/WhatWeTestPanel";
import { ResultsList, RESULTS_PAGE_SIZE, type ImpactFilter } from "@/components/ResultsList";
import { useScanSession } from "@/components/ScanSessionProvider";
import { summarizeIssues, type AxeOverviewStats, type ScanIssue } from "@/lib/axeScanner";
import { scanRuntimeStageMessages } from "@/lib/scanRuntimeStages";
import { exportIssuesCsv, exportIssuesPdf } from "@/lib/exportReports";
import { openScanExplainTab, writeExplainWindowPayload } from "@/lib/explainWindowTransfer";
import { MAX_ISSUES_IN_HISTORY, saveScanToHistory } from "@/lib/scanHistory";
import { decodeScanUrlParam, formatUrlForScanLog, validateScanUrl } from "@/lib/url";
import { APP_NAME } from "@/lib/brand";
import {
  buildScanSummarySpeech,
  speakText,
  stopSpeaking,
  type VoiceCommand,
} from "@/lib/voice";

function scanLogTime(): string {
  return new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const VoiceAssistant = dynamic(
  () => import("@/components/VoiceAssistant").then((m) => m.VoiceAssistant),
  {
    ssr: false,
    loading: () => (
      <div className="flex w-full justify-end gap-2 sm:min-w-[13rem]" aria-hidden>
        <div className="bg-white/10 h-11 w-[6.5rem] animate-pulse rounded-lg" />
        <div className="bg-white/10 h-11 w-24 animate-pulse rounded-lg" />
      </div>
    ),
  },
);

type ScanSummary = {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
};

export default function ScanWorkspacePage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { scannedUrl, issues, reviewIssues, setScanResults, clearScan, setScanActivity } = useScanSession();
  const [url, setUrl] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [filter, setFilter] = useState<ImpactFilter>("all");
  const [selected, setSelected] = useState<ScanIssue | null>(null);
  const [findingsTab, setFindingsTab] = useState<"violations" | "review">("violations");

  const [voiceStatus, setVoiceStatus] = useState("");
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  /** Brief UI hint while the explain tab is opening. */
  const [explainWindowOpeningIndex, setExplainWindowOpeningIndex] = useState<number | null>(null);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraFeedback, setJiraFeedback] = useState<string | null>(null);
  const [scanLogLines, setScanLogLines] = useState<ScanLogLine[]>([]);
  const scanAbortRef = useRef<AbortController | null>(null);
  const scanGenerationRef = useRef(0);
  /** After a successful scan, show summary + spinner until user clicks Show results. */
  const [awaitingRevealAfterScan, setAwaitingRevealAfterScan] = useState(false);
  /** After reveal, scan returned 0 issues — show success empty instead of “start scan”. */
  const [showZeroViolationsBanner, setShowZeroViolationsBanner] = useState(false);

  const scanSummary: ScanSummary | null = useMemo(() => {
    if (!scannedUrl) return null;
    const primary = issues.length > 0 ? issues : reviewIssues;
    if (primary.length === 0) return null;
    const s = summarizeIssues(primary);
    return {
      scannedUrl,
      total: s.total,
      byImpact: s.byImpact as Record<string, number>,
      topRules: s.topRules,
    };
  }, [scannedUrl, issues, reviewIssues]);

  const activeIssues = findingsTab === "violations" ? issues : reviewIssues;

  const filteredIssueCount = useMemo(() => {
    if (filter === "all") return activeIssues.length;
    return activeIssues.filter((i) => i.impact === filter).length;
  }, [activeIssues, filter]);

  useEffect(() => {
    if (!selected) return;
    const stillHere = activeIssues.some((i) => i.index === selected.index);
    if (!stillHere) setSelected(null);
  }, [activeIssues, selected]);

  const filterExportSubtitle = useMemo(() => {
    if (filter === "all") return "All severities";
    return `${filter.charAt(0).toUpperCase() + filter.slice(1)} only`;
  }, [filter]);

  const signinQueryActive = useMemo(
    () =>
      searchParams.get("requiresLogin") === "1" ||
      searchParams.get("signin") === "1" ||
      searchParams.get("requires_login") === "1",
    [searchParams],
  );

  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const rawUrl = sp.get("prefillUrl") ?? sp.get("url");
    const signin =
      sp.get("requiresLogin") === "1" ||
      sp.get("signin") === "1" ||
      sp.get("requires_login") === "1";
    if (!rawUrl?.trim() && !signin) return;

    if (rawUrl?.trim()) {
      const decoded = decodeScanUrlParam(rawUrl);
      const v = validateScanUrl(decoded);
      if (v.ok) {
        setUrl(v.url);
        setScanError(null);
      } else {
        setScanError(`From link: ${v.error}`);
      }
    }

    sp.delete("prefillUrl");
    sp.delete("url");
    sp.delete("requiresLogin");
    sp.delete("signin");
    sp.delete("requires_login");
    const next = sp.toString();
    const path = pathname || "/scan";
    router.replace(next ? `${path}?${next}` : path, { scroll: false });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    const scrollTo = () => {
      if (typeof window === "undefined") return;
      const id = window.location.hash === "#findings-section" ? "findings-section" : "scan-section";
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    scrollTo();
    window.addEventListener("hashchange", scrollTo);
    return () => window.removeEventListener("hashchange", scrollTo);
  }, []);

  useEffect(() => {
    if (!scanLoading && !awaitingRevealAfterScan) return;
    const el = document.getElementById("findings-section");
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [scanLoading, awaitingRevealAfterScan]);

  const speakWithTracking = useCallback((text: string) => {
    speakText(text, {
      onStart: () => setTtsSpeaking(true),
      onEnd: () => setTtsSpeaking(false),
    });
  }, []);

  const clearTtsSpeaking = useCallback(() => {
    setTtsSpeaking(false);
  }, []);

  const defaultScanOptions = useMemo(
    (): NewScanOptions => ({
      wcagPreset: "wcag21-aa",
      deepScan: true,
      requiresLogin: false,
    }),
    [],
  );

  const cancelScan = useCallback(() => {
    scanAbortRef.current?.abort();
  }, []);

  const runScan = useCallback(
    async (scanOpts?: NewScanOptions) => {
      const o = scanOpts ?? defaultScanOptions;
      const v = validateScanUrl(url);
      if (!v.ok) {
        setScanError(v.error);
        setVoiceStatus(v.error);
        return;
      }
      scanAbortRef.current?.abort();
      const ac = new AbortController();
      scanAbortRef.current = ac;
      scanGenerationRef.current += 1;
      const generation = scanGenerationRef.current;

      const stages = scanRuntimeStageMessages(o.deepScan, v.url);
      const t0 = scanLogTime();
      setScanLogLines([{ id: "log-0", text: `${t0} ${stages[0] ?? `${formatUrlForScanLog(v.url)} — Starting…`}` }]);
      let stageStep = 1;
      let progressInterval: number | null = null;
      progressInterval = window.setInterval(() => {
        if (stageStep >= stages.length) return;
        const ts = scanLogTime();
        const line = stages[stageStep];
        setScanLogLines((prev) => [...prev, { id: `log-s-${stageStep}-${Date.now()}`, text: `${ts} ${line}` }]);
        stageStep += 1;
      }, 950);

      setAwaitingRevealAfterScan(false);
      setShowZeroViolationsBanner(false);

      setScanError(null);
      setScanLoading(true);
      setJiraFeedback(null);
      setScanActivity({ inProgress: true, pendingUrl: v.url });
      setSelected(null);
      setVoiceStatus("Scan started.");
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: v.url,
            wcagPreset: o.wcagPreset,
            deepScan: o.deepScan,
            requiresLogin: o.requiresLogin,
            ...(Array.isArray(o.cookies) && o.cookies.length > 0 ? { cookies: o.cookies } : {}),
          }),
          signal: ac.signal,
        });
        if (scanGenerationRef.current !== generation) {
          return;
        }
        const data = (await res.json()) as {
          error?: string;
          issues?: ScanIssue[];
          reviewIssues?: ScanIssue[];
          scannedUrl?: string;
          axeOverview?: AxeOverviewStats;
          meta?: {
            chromeAxSummary?: { nonIgnoredCount: number; topRoles: { role: string; count: number }[] };
            reviewInstancesCapped?: boolean;
          };
        };
        if (scanGenerationRef.current !== generation) {
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || "Scan failed");
        }
        if (scanGenerationRef.current !== generation) {
          return;
        }
        const list = data.issues ?? [];
        const reviewList = data.reviewIssues ?? [];
        const finalUrl = data.scannedUrl ?? v.url;
        const meta = data.meta;
        const urlLabel = formatUrlForScanLog(finalUrl, 80);
        const axNodes = meta?.chromeAxSummary?.nonIgnoredCount;
        const axPart =
          typeof axNodes === "number" ? ` Accessibility tree: ${axNodes} nodes (non-ignored).` : "";
        const cappedNote = meta?.reviewInstancesCapped ? " Needs-review list truncated on server." : "";
        setScanLogLines((prev) => [
          ...prev,
          {
            id: `log-done-${Date.now()}`,
            text: `${scanLogTime()} ${urlLabel} — Finished.${axPart} Violations: ${list.length}. Needs review: ${reviewList.length}.${cappedNote}`,
          },
        ]);
        setScanResults(finalUrl, list, reviewList);
        if (list.length === 0 && reviewList.length > 0) {
          setFindingsTab("review");
        } else {
          setFindingsTab("violations");
        }
        setAwaitingRevealAfterScan(true);
        setVoiceStatus(
          `Scan complete. ${list.length} violation${list.length === 1 ? "" : "s"}, ${reviewList.length} needs review.`,
        );
        const s = summarizeIssues(list);
        const incompleteN =
          data.axeOverview?.incompleteInstances ?? data.axeOverview?.incompleteRules ?? reviewList.length;
        saveScanToHistory({
          scannedUrl: data.scannedUrl ?? v.url,
          totalIssues: list.length,
          byImpact: s.byImpact as Record<string, number>,
          incompleteInstances: incompleteN,
          issues: list.slice(0, MAX_ISSUES_IN_HISTORY),
          reviewIssues: reviewList.slice(0, MAX_ISSUES_IN_HISTORY),
          totalReviewIssues: reviewList.length,
          issuesSample: list.slice(0, 20).map((i) => ({
            id: i.id,
            impact: i.impact,
            description: i.description,
          })),
        });
      } catch (e) {
        if (ac.signal.aborted) {
          if (scanGenerationRef.current === generation) {
            setAwaitingRevealAfterScan(false);
            setScanLogLines((prev) => [
              ...prev,
              { id: `log-cancel-${Date.now()}`, text: `${scanLogTime()} Scan cancelled.` },
            ]);
            setVoiceStatus("Scan cancelled.");
          }
          return;
        }
        const msg = e instanceof Error ? e.message : "Scan failed";
        if (scanGenerationRef.current === generation) {
          setAwaitingRevealAfterScan(false);
          setScanLogLines((prev) => [
            ...prev,
            { id: `log-err-${Date.now()}`, text: `${scanLogTime()} Error: ${msg}` },
          ]);
          setScanError(msg);
          setVoiceStatus(msg);
        }
      } finally {
        if (progressInterval) window.clearInterval(progressInterval);
        if (scanAbortRef.current === ac) {
          scanAbortRef.current = null;
        }
        if (scanGenerationRef.current === generation) {
          setScanLoading(false);
          setScanActivity({ inProgress: false, pendingUrl: null });
        }
      }
    },
    [url, setScanResults, setScanActivity, defaultScanOptions],
  );

  const revealFindings = useCallback(() => {
    setAwaitingRevealAfterScan(false);
    setShowZeroViolationsBanner(issues.length === 0 && reviewIssues.length === 0);
  }, [issues.length, reviewIssues.length]);

  const handleReset = useCallback(() => {
    scanGenerationRef.current += 1;
    scanAbortRef.current?.abort();
    scanAbortRef.current = null;
    setScanLogLines([]);
    setAwaitingRevealAfterScan(false);
    setShowZeroViolationsBanner(false);
    clearScan();
    stopSpeaking();
    setTtsSpeaking(false);
    setUrl("");
    setScanLoading(false);
    setScanActivity({ inProgress: false, pendingUrl: null });
    setScanError(null);
    setFilter("all");
    setFindingsTab("violations");
    setSelected(null);
    setVoiceStatus("Session reset.");
    setExplainWindowOpeningIndex(null);
    setJiraFeedback(null);
  }, [clearScan, setScanActivity]);

  const openExplainInNewWindow = useCallback(
    (issue: ScanIssue, options?: { voiceRead?: boolean }) => {
      if (!scanSummary || !scannedUrl) {
        setVoiceStatus("Run a scan first, then open Explain with AI.");
        return;
      }
      setSelected(issue);
      writeExplainWindowPayload({
        mode: "issue",
        scannedUrl,
        scanSummary,
        issue,
        prefillChat: null,
      });
      const w = openScanExplainTab();
      if (!w) {
        setVoiceStatus("Pop-up blocked. Allow pop-ups for this site to open Explain with AI.");
        return;
      }
      setExplainWindowOpeningIndex(issue.index);
      window.setTimeout(() => setExplainWindowOpeningIndex(null), 3000);
      setVoiceStatus(`Opened issue ${issue.index} in a new tab.`);
      if (options?.voiceRead) {
        speakWithTracking(`Opened explanation for issue ${issue.index} in a new tab.`);
      }
    },
    [scanSummary, scannedUrl, speakWithTracking],
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
        const issue =
          issues.find((i) => i.index === cmd.index) ?? reviewIssues.find((i) => i.index === cmd.index);
        if (!issue) {
          setVoiceStatus(`No issue number ${cmd.index}.`);
          return;
        }
        openExplainInNewWindow(issue, { voiceRead: true });
        return;
      }
      if (cmd.type === "how_to_fix") {
        if (!selected) {
          setVoiceStatus("Select an issue first, or say explain issue followed by a number.");
          return;
        }
        openExplainInNewWindow(selected, { voiceRead: true });
        return;
      }
      if (cmd.type === "chat_explain_scan") {
        if (!scannedUrl || (issues.length === 0 && reviewIssues.length === 0) || !scanSummary) {
          setVoiceStatus("Run a scan first, then ask to explain the issues.");
          return;
        }
        writeExplainWindowPayload({
          mode: "chatOnly",
          scannedUrl,
          scanSummary,
          issue: null,
          prefillChat:
            "Summarize the accessibility issues found in this scan in plain language. Group by severity, mention key WCAG rule IDs from the scan, and give practical next steps for a developer.",
        });
        const w = openScanExplainTab();
        if (!w) {
          setVoiceStatus("Pop-up blocked. Allow pop-ups for this site to open scan chat.");
          return;
        }
        setVoiceStatus("Opened scan chat in a new tab.");
        return;
      }
      if (cmd.type === "speak_scan_summary") {
        if (!scannedUrl || (issues.length === 0 && reviewIssues.length === 0)) {
          setVoiceStatus("No results to read. Run a scan first.");
          return;
        }
        const primary = issues.length > 0 ? issues : reviewIssues;
        const s = summarizeIssues(primary);
        speakWithTracking(
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
    [issues, reviewIssues, openExplainInNewWindow, runScan, scannedUrl, scanSummary, selected, speakWithTracking],
  );

  const reportToJira = useCallback(
    async (issue: ScanIssue) => {
      if (!scannedUrl) {
        setVoiceStatus("Run a scan first before reporting to Jira.");
        return;
      }
      setJiraLoading(true);
      setJiraFeedback(null);
      try {
        const res = await fetch("/api/jira-issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: `[A11y] ${issue.id}`,
            description: issue.description,
            url: scannedUrl,
            impact: issue.impact,
            html: issue.html,
            issueIndex: issue.index,
            helpUrl: issue.helpUrl,
            sourceUrl: issue.sourceUrl,
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
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Jira request failed");
        }
        const line = data.url
          ? `${data.mock ? "Logged (mock): " : "Created "}${data.key ?? ""} — ${data.url}`
          : (data.message ?? "Submitted.");
        setJiraFeedback(line);
        setVoiceStatus(line);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Jira failed";
        setJiraFeedback(msg);
        setVoiceStatus(msg);
      } finally {
        setJiraLoading(false);
      }
    },
    [scannedUrl],
  );

  const hasRevealableFindings = issues.length > 0 || reviewIssues.length > 0;

  return (
    <div className="text-sm leading-relaxed text-zinc-300">
      <div className="border-border/40 mx-auto flex max-w-[min(100%,1440px)] flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm font-medium"
        >
          <LayoutDashboard className="size-4 shrink-0" aria-hidden />
          Back to dashboard
        </Link>
        <Button type="button" variant="secondary" size="sm" className="gap-2 shrink-0 text-sm" onClick={handleReset}>
          <RotateCcw className="size-4 shrink-0" aria-hidden />
          Reset workspace
        </Button>
      </div>

      <div className="mx-auto max-w-[min(100%,1440px)] space-y-5 px-4 py-6">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/55 shadow-xl backdrop-blur-md">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="flex min-h-0 flex-col border-b border-white/[0.06] lg:col-span-8 lg:border-r lg:border-b-0">
              <section id="scan-section" className="scroll-mt-24 space-y-4 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <ScanSearch className="size-5 shrink-0 text-emerald-400" aria-hidden />
                  <h1 className="text-lg font-semibold tracking-tight text-zinc-50">Accessibility scan</h1>
                </div>
                <p className="text-muted-foreground -mt-2 text-sm leading-relaxed text-zinc-400">
                  Enter a web address, adjust options if you like, then press{" "}
                  <span className="font-medium text-zinc-300">Start scan</span> or use{" "}
                  <span className="font-medium text-zinc-300">Voice</span> beside it. Use{" "}
                  <span className="font-medium text-zinc-300">Explain with AI</span> on a row to open a new tab with the
                  full write-up and follow-up chat; export reports or send a ticket to Jira from here.
                </p>
                <NewScanLayout
                  url={url}
                  onUrlChange={setUrl}
                  defaultRequiresLogin={signinQueryActive}
                  scanLoading={scanLoading}
                  awaitingResultReveal={awaitingRevealAfterScan}
                  scanError={scanError}
                  onStartScan={(opts) => void runScan(opts)}
                  voiceControl={
                    <VoiceAssistant
                      variant="inline"
                      onCommand={handleVoice}
                      ttsSpeaking={ttsSpeaking}
                      onTtsStopped={clearTtsSpeaking}
                    />
                  }
                />
              </section>
            </div>

            <aside
              className="border-t border-white/[0.06] bg-zinc-950/40 lg:col-span-4 lg:border-t-0"
              aria-label="What we test"
            >
              <div className="p-5 sm:p-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
                <WhatWeTestPanel />
              </div>
            </aside>

            <section
              id="findings-section"
              className="scroll-mt-24 flex min-h-[min(400px,55vh)] flex-col gap-4 border-t border-white/[0.06] p-5 sm:p-6 lg:col-span-12"
              aria-labelledby="results-heading"
            >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="bg-primary/15 flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <ListChecks className="text-primary size-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h2 id="results-heading" className="text-base font-semibold tracking-tight text-zinc-50">
                        Findings
                      </h2>
                      {scanLoading ? (
                        <p className="text-muted-foreground mt-1 text-sm">Scan running—status updates below.</p>
                      ) : awaitingRevealAfterScan ? (
                        <p className="text-muted-foreground mt-1 text-sm">
                          Summary:{" "}
                          <span className="font-medium text-zinc-300 tabular-nums">{issues.length}</span> violations ·{" "}
                          <span className="font-medium text-amber-200/90 tabular-nums">{reviewIssues.length}</span>{" "}
                          needs review · click{" "}
                          <span className="text-zinc-200">Show results</span> for the full list ·{" "}
                          <Link href="/testing/ai-report" className="text-primary underline-offset-2 hover:underline">
                            AI report Analysis
                          </Link>
                        </p>
                      ) : hasRevealableFindings ? (
                        <>
                          <p className="text-foreground/95 mt-1 text-sm leading-relaxed">
                            <span className="tabular-nums font-semibold text-zinc-200">{issues.length}</span>{" "}
                            violations ·{" "}
                            <span className="tabular-nums font-semibold text-amber-200/90">{reviewIssues.length}</span>{" "}
                            needs review
                            {scannedUrl ? (
                              <>
                                {" "}
                                <span className="text-muted-foreground">·</span>{" "}
                                <span className="break-all font-mono text-xs text-zinc-400">{scannedUrl}</span>
                              </>
                            ) : null}
                          </p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            <span className="font-medium text-zinc-400">{filterExportSubtitle}</span> ·{" "}
                            {findingsTab === "violations" ? "Violations" : "Needs review"} tab · {filteredIssueCount} in
                            exports
                            {filteredIssueCount > RESULTS_PAGE_SIZE ? (
                              <>
                                {" "}
                                · <span className="text-zinc-400">{RESULTS_PAGE_SIZE} per page</span>
                              </>
                            ) : null}{" "}
                            ·{" "}
                            <Link href="/testing/ai-report" className="text-primary underline-offset-2 hover:underline">
                              AI report Analysis
                            </Link>
                          </p>
                        </>
                      ) : showZeroViolationsBanner ? (
                        <p className="text-muted-foreground mt-1 text-sm">
                          The last scan didn&apos;t flag issues for this page with your current settings. Try another URL
                          or change options and scan again.
                        </p>
                      ) : (
                        <p className="text-muted-foreground mt-1 text-sm">Run a scan to see a list of issues here.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-white/10 bg-black/30 text-sm"
                      disabled={
                        !scannedUrl ||
                        activeIssues.length === 0 ||
                        filteredIssueCount === 0 ||
                        scanLoading ||
                        awaitingRevealAfterScan
                      }
                      onClick={() => scannedUrl && exportIssuesPdf(scannedUrl, activeIssues, filter)}
                    >
                      <FileDown className="size-4 shrink-0" aria-hidden />
                      PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-white/10 bg-black/30 text-sm"
                      disabled={
                        !scannedUrl ||
                        activeIssues.length === 0 ||
                        filteredIssueCount === 0 ||
                        scanLoading ||
                        awaitingRevealAfterScan
                      }
                      onClick={() => scannedUrl && exportIssuesCsv(scannedUrl, activeIssues, filter)}
                    >
                      <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
                      CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-white/10 bg-black/30 text-sm"
                      disabled={!selected || jiraLoading || scanLoading || awaitingRevealAfterScan}
                      onClick={() => selected && void reportToJira(selected)}
                    >
                      {jiraLoading ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Ticket className="size-4 shrink-0" aria-hidden />
                      )}
                      Report to Jira
                    </Button>
                  </div>
                </div>

                {scanLoading ? (
                  <ScanInProgressPanel
                    phase="scanning"
                    pagesLabel="1/1"
                    violationsCount={0}
                    needsReviewCount={0}
                    logLines={scanLogLines}
                    onCancel={cancelScan}
                  />
                ) : awaitingRevealAfterScan ? (
                  <ScanInProgressPanel
                    phase="summary"
                    pagesLabel="1/1"
                    violationsCount={issues.length}
                    needsReviewCount={reviewIssues.length}
                    logLines={scanLogLines}
                    onCancel={cancelScan}
                    onShowResults={revealFindings}
                  />
                ) : hasRevealableFindings ? (
                  <Tabs
                    value={findingsTab}
                    onValueChange={(v) => setFindingsTab(v as "violations" | "review")}
                    className="w-full min-w-0"
                  >
                    <TabsList
                      className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/30"
                      aria-label="Findings type"
                    >
                      <TabsTrigger value="violations" className="tabular-nums">
                        Violations ({issues.length})
                      </TabsTrigger>
                      <TabsTrigger value="review" className="tabular-nums">
                        Needs review ({reviewIssues.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="violations" className="mt-3 outline-none" tabIndex={-1}>
                      {issues.length === 0 ? (
                        <p className="text-muted-foreground rounded-lg border border-white/[0.06] bg-black/20 px-4 py-10 text-center text-sm leading-relaxed">
                          No violations for this run. Open the <strong className="text-zinc-300">Needs review</strong> tab
                          for axe &quot;incomplete&quot; items that need manual confirmation.
                        </p>
                      ) : (
                        <ResultsList
                          key={`${scannedUrl ?? "no-url"}-v`}
                          issues={issues}
                          filter={filter}
                          onFilterChange={setFilter}
                          selected={selected}
                          onSelect={setSelected}
                          onExplain={(issue) => openExplainInNewWindow(issue)}
                          explainingId={explainWindowOpeningIndex}
                          onReportJira={(issue) => void reportToJira(issue)}
                          jiraLoading={jiraLoading}
                          embedded
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="review" className="mt-3 outline-none" tabIndex={-1}>
                      {reviewIssues.length === 0 ? (
                        <p className="text-muted-foreground rounded-lg border border-white/[0.06] bg-black/20 px-4 py-10 text-center text-sm leading-relaxed">
                          No needs-review items — axe did not return incomplete results for this page with your preset.
                        </p>
                      ) : (
                        <ResultsList
                          key={`${scannedUrl ?? "no-url"}-r`}
                          issues={reviewIssues}
                          filter={filter}
                          onFilterChange={setFilter}
                          selected={selected}
                          onSelect={setSelected}
                          onExplain={(issue) => openExplainInNewWindow(issue)}
                          explainingId={explainWindowOpeningIndex}
                          onReportJira={(issue) => void reportToJira(issue)}
                          jiraLoading={jiraLoading}
                          embedded
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                ) : showZeroViolationsBanner ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/20 py-14 text-center">
                    <ListChecks className="size-10 text-emerald-400/90" aria-hidden />
                    <p className="text-foreground max-w-sm text-sm font-medium">No violations detected</p>
                    <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                      The automatic check didn&apos;t find problems for this address with your current settings. Try a
                      different page, a stricter accessibility level, or turn on a deeper scan.
                    </p>
                  </div>
                ) : (
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-black/20 py-14 text-center">
                    <ScanSearch className="size-10 opacity-30" aria-hidden />
                    <p className="max-w-sm text-sm leading-relaxed">Nothing to show yet. Add a URL above and start a scan.</p>
                  </div>
                )}
            </section>
          </div>
        </div>

        {jiraFeedback ? (
          <Alert className="border-emerald-500/30 bg-emerald-950/20">
            <AlertTitle className="text-sm font-semibold">Jira</AlertTitle>
            <AlertDescription className="text-sm leading-relaxed">{jiraFeedback}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <footer className="text-muted-foreground border-t border-white/10 bg-card/30 px-4 py-6 text-center text-xs leading-relaxed backdrop-blur-sm">
        <p className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
          <Bot className="text-primary size-4 shrink-0" aria-hidden />
          <span>
            <strong className="text-foreground">{APP_NAME}</strong> · Voice uses the Web Speech API · Scans
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
