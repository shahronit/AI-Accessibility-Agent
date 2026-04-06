"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileDown, Loader2, MessageSquare, Mic, MicOff, Send, Sparkles } from "lucide-react";
import { FormattedAiText } from "@/components/FormattedAiText";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLiveSpeechRecognition } from "@/hooks/useLiveSpeechRecognition";
import type { ChatMessage } from "@/lib/aiClient";
import type { ScanIssue } from "@/lib/axeScanner";
import { exportChatPdf } from "@/lib/exportReports";

type ScanSummary = {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
};

export type ChatSendPayload = {
  messages: ChatMessage[];
  scanSummary: ScanSummary | null;
  issueFocus: ScanIssue | null;
  explanationContext: string | null;
};

type Props = {
  scanSummary: ScanSummary | null;
  selectedIssue: ScanIssue | null;
  explanationText: string | null;
  onSend: (payload: ChatSendPayload) => Promise<string>;
  /** When `id` changes, the panel sends `text` as a user message (e.g. voice → chat). */
  voiceSendTrigger: { id: number; text: string } | null;
  /** Replaces the default subtitle under “AI chat”. */
  contextHint?: string;
};

export function ChatPanel({
  scanSummary,
  selectedIssue,
  explanationText,
  onSend,
  voiceSendTrigger,
  contextHint,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechErr, setSpeechErr] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const lastVoiceIdRef = useRef<number | null>(null);

  messagesRef.current = messages;

  const buildPayload = useCallback(
    (next: ChatMessage[]): ChatSendPayload => ({
      messages: next,
      scanSummary,
      issueFocus: selectedIssue,
      explanationContext: explanationText,
    }),
    [scanSummary, selectedIssue, explanationText],
  );

  const speech = useLiveSpeechRecognition({
    onFinal: (t) => {
      setSpeechErr(null);
      setInput((prev) => {
        const p = prev.trim();
        return p ? `${p} ${t}` : t;
      });
    },
    onError: (msg) => {
      if (msg) setSpeechErr(msg);
    },
  });

  const speechStopRef = useRef(speech.stop);
  speechStopRef.current = speech.stop;

  const submitMessage = useCallback(
    async (text: string, clearInputField: boolean) => {
      speechStopRef.current();
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      const next = [...messagesRef.current, { role: "user" as const, content: trimmed }];
      setMessages(next);
      if (clearInputField) {
        setInput("");
      }
      setLoading(true);
      try {
        const reply = await onSend(buildPayload(next));
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Chat failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [buildPayload, loading, onSend],
  );

  useEffect(() => {
    if (!voiceSendTrigger) return;
    if (lastVoiceIdRef.current === voiceSendTrigger.id) return;
    lastVoiceIdRef.current = voiceSendTrigger.id;
    void submitMessage(voiceSendTrigger.text, false);
  }, [voiceSendTrigger, submitMessage]);

  const handleExportPdf = () => {
    if (messages.length === 0) return;
    exportChatPdf({
      scannedUrl: scanSummary?.scannedUrl ?? null,
      messages,
      issueLabel: selectedIssue ? `#${selectedIssue.index} ${selectedIssue.id}` : null,
    });
  };

  return (
    <Card className="agent-card flex min-h-[420px] flex-col">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex gap-3">
            <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
              <MessageSquare className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                AI chat
                <Sparkles className="text-amber-400 size-4" aria-hidden />
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {contextHint ??
                  "Context includes the full scan; use Explain with AI on the scanner to open a focused tab with explanation and chat."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={messages.length === 0}
            onClick={handleExportPdf}
          >
            <FileDown className="mr-1 size-4" aria-hidden />
            Export PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          className="max-h-[min(42vh,380px)] min-h-[200px] overflow-y-auto overflow-x-hidden rounded-md border p-3"
          role="region"
          aria-label="Chat messages"
          aria-busy={loading}
        >
          <div className="space-y-3 pr-1" role="log" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Run a scan first. Say &quot;Explain the issues&quot; by voice or type a question about the results.
              </p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="text-muted-foreground font-medium">{m.role === "user" ? "You" : "Assistant"}: </span>
                  {m.role === "assistant" ? (
                    <FormattedAiText text={m.content} className="mt-1" />
                  ) : (
                    <span className="mt-1 block whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              ))
            )}
            {loading ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                Thinking…
              </p>
            ) : null}
          </div>
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {speechErr ? (
          <p className="text-destructive text-sm" role="alert">
            {speechErr}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedIssue ? "Ask about this issue…" : "Ask about the scan…"}
            rows={2}
            className="min-h-[72px] flex-1 resize-none"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!loading) void submitMessage(input, true);
              }
            }}
            aria-label="Chat message"
          />
          <div className="flex shrink-0 flex-col gap-2 self-end">
            <Button
              type="button"
              variant={speech.listening ? "destructive" : "outline"}
              size="icon"
              className="size-10"
              disabled={speech.starting || loading}
              onClick={() => {
                setSpeechErr(null);
                if (speech.listening) speech.stop();
                else void speech.start();
              }}
              aria-label={speech.listening ? "Stop microphone" : "Dictate message"}
              aria-pressed={speech.listening}
            >
              {speech.starting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : speech.listening ? (
                <MicOff className="size-4" aria-hidden />
              ) : (
                <Mic className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              className="size-10"
              onClick={() => void submitMessage(input, true)}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </Button>
          </div>
        </div>
        {!scanSummary || scanSummary.total === 0 ? (
          <p className="text-muted-foreground text-xs">Run a scan to attach results to chat.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
