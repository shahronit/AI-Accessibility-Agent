"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, LayoutDashboard, Loader2, Sparkles, Square, Volume2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatPanel, type ChatSendPayload } from "@/components/ChatPanel";
import { FormattedAiText } from "@/components/FormattedAiText";
import type { ExplainWindowPayloadV1 } from "@/lib/explainWindowTransfer";
import { readAndConsumeExplainWindowPayload } from "@/lib/explainWindowTransfer";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";
import { exportExplanationPdf } from "@/lib/exportReports";
import { extractProfessionalSummary, sanitizeExplanationForDisplay } from "@/lib/formatAiOutput";
import { cn } from "@/lib/utils";
import { speakText, stopSpeaking, summarizeForSpeech } from "@/lib/voice";

export function ScanIssueExplainWorkspace() {
  const [payload, setPayload] = useState<ExplainWindowPayloadV1 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainModel, setExplainModel] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [voiceSendTrigger, setVoiceSendTrigger] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    const p = readAndConsumeExplainWindowPayload();
    if (!p) {
      setLoadError(
        "No explanation data found. Use Explain with AI on the scanner, or run a scan and try again from the same browser.",
      );
      return;
    }
    setPayload(p);
  }, []);

  useEffect(() => {
    if (!payload?.prefillChat?.trim()) return;
    setVoiceSendTrigger({ id: Date.now(), text: payload.prefillChat.trim() });
  }, [payload]);

  useEffect(() => {
    if (!payload || payload.mode !== "issue" || !payload.issue) return;
    // Fix 6 fast path: if the parent workspace pre-fetched this issue's
    // explanation (top-10 auto-explain warm-up), render it immediately
    // instead of re-hitting `/api/ai-explain`. The text is already
    // server-sanitised when it lands here.
    if (payload.prefetchedExplanation) {
      setExplainLoading(false);
      setExplainError(null);
      setExplanation(payload.prefetchedExplanation);
      setExplainModel(payload.prefetchedExplanationModel ?? null);
      return;
    }
    let cancelled = false;
    setExplainLoading(true);
    setExplainError(null);
    setExplanation(null);
    setExplainModel(null);
    (async () => {
      try {
        const data = await postAppJson<{ explanation?: string; model?: string }>("/api/ai-explain", {
          issue: sanitizeIssueForApi(payload.issue!),
        });
        if (cancelled) return;
        setExplanation(data.explanation ?? "");
        setExplainModel(typeof data.model === "string" ? data.model : null);
      } catch (e) {
        if (cancelled) return;
        setExplainError(e instanceof Error ? e.message : "Explanation failed");
      } finally {
        if (!cancelled) setExplainLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const speakWithTracking = useCallback((text: string) => {
    speakText(text, {
      onStart: () => setTtsSpeaking(true),
      onEnd: () => setTtsSpeaking(false),
    });
  }, []);

  const handleStopTts = useCallback(() => {
    stopSpeaking();
    setTtsSpeaking(false);
  }, []);

  const sendChat = useCallback(async (p: ChatSendPayload) => {
    const issue = p.issueFocus;
    const data = await postAppJson<{ reply?: string }>("/api/chat", {
      messages: p.messages,
      scanSummary: p.scanSummary ?? undefined,
      issueFocus: issue
        ? {
            index: issue.index,
            id: issue.id,
            impact: issue.impact,
            description: issue.description.slice(0, 4000),
            helpUrl: issue.helpUrl,
          }
        : undefined,
      explanationContext: p.explanationContext ?? undefined,
    });
    return typeof data.reply === "string" ? data.reply : "";
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
        <Alert variant="destructive">
          <AlertTitle className="text-sm">Could not open explanation</AlertTitle>
          <AlertDescription className="text-sm">{loadError}</AlertDescription>
        </Alert>
        <Link
          href="/scan"
          className={cn(buttonVariants({ variant: "outline", size: "default" }), "inline-flex gap-2")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to scanner
        </Link>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12" aria-busy="true">
        <div className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
          <Loader2 className="text-primary size-5 shrink-0 animate-spin" aria-hidden />
          Loading explanation workspace…
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const issue = payload.issue;
  const scanSummary = payload.scanSummary;
  const scannedUrl = payload.scannedUrl ?? scanSummary?.scannedUrl ?? null;

  return (
    <div className="text-foreground min-h-full bg-background text-sm leading-relaxed">
      <div className="border-border/40 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/scan"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Scanner
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}>
            <LayoutDashboard className="size-4" aria-hidden />
            Dashboard
          </Link>
        </div>
        {payload.mode === "issue" && issue ? (
          <p className="text-muted-foreground max-w-xl truncate text-xs font-mono">{issue.id}</p>
        ) : (
          <p className="text-muted-foreground text-xs">Scan overview chat</p>
        )}
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        {payload.mode === "issue" && issue ? (
          <Card className="agent-card border-white/[0.08]">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-2">
                  <div className="bg-amber-500/15 flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Sparkles className="size-4 text-amber-400" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-base">AI explanation</CardTitle>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Issue #{issue.index} · {payload.scannedUrl ? <span className="break-all">{payload.scannedUrl}</span> : "URL from scan"}
                    </p>
                    {explainModel ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">Model · {explainModel}</p>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 border-white/10 bg-black/30"
                  disabled={!explanation}
                  onClick={() =>
                    exportExplanationPdf({
                      scannedUrl,
                      issue,
                      explanation: explanation ?? "",
                    })
                  }
                >
                  <FileDown className="size-4 shrink-0" aria-hidden />
                  Export PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {explainLoading ? (
                <div className="space-y-3" aria-busy="true">
                  <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                    <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
                    Generating explanation…
                  </p>
                  <Skeleton className="h-5 w-3/4 rounded-md" />
                  <Skeleton className="h-40 w-full rounded-md" />
                </div>
              ) : null}
              {explainError ? (
                <Alert variant="destructive">
                  <AlertTitle className="text-sm">Explanation error</AlertTitle>
                  <AlertDescription className="text-sm">{explainError}</AlertDescription>
                </Alert>
              ) : null}
              {explanation ? (
                <div className="max-h-[min(50vh,480px)] overflow-y-auto overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-3">
                  <FormattedAiText text={sanitizeExplanationForDisplay(explanation)} />
                </div>
              ) : !explainLoading && !explainError ? (
                <p className="text-muted-foreground text-sm">No explanation loaded.</p>
              ) : null}
              {explanation ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Read explanation aloud">
                  {ttsSpeaking ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleStopTts}
                    >
                      <Square className="size-3.5 shrink-0" aria-hidden />
                      Stop speaking
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => speakWithTracking(summarizeForSpeech(explanation, issue))}
                  >
                    <Volume2 className="size-3.5 shrink-0" aria-hidden />
                    Read opening
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => speakWithTracking(extractProfessionalSummary(explanation))}
                  >
                    <Sparkles className="size-3.5 shrink-0 text-amber-400" aria-hidden />
                    Speak summary
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="agent-card border-white/[0.08]">
            <CardHeader>
              <CardTitle className="text-base">Scan chat</CardTitle>
              <p className="text-muted-foreground text-sm">
                Ask questions about all findings for{" "}
                {scannedUrl ? <span className="break-all font-mono text-xs">{scannedUrl}</span> : "this scan"}.
              </p>
            </CardHeader>
          </Card>
        )}

        <ChatPanel
          scanSummary={scanSummary}
          selectedIssue={issue}
          explanationText={payload.mode === "issue" ? explanation : null}
          onSend={sendChat}
          voiceSendTrigger={voiceSendTrigger}
          contextHint={
            payload.mode === "issue"
              ? "Context: full scan plus the explanation above. Ask follow-ups or counter-questions."
              : "Context: full scan results. Ask about severity, themes, or remediation order."
          }
        />
      </div>
    </div>
  );
}
