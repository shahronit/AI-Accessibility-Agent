"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/aiClient";

type ScanSummary = {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
};

type Props = {
  scanSummary: ScanSummary | null;
  onSend: (messages: ChatMessage[]) => Promise<string>;
};

export function ChatPanel({ scanSummary, onSend }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await onSend(next);
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chat failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex min-h-[420px] flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">AI chat</CardTitle>
        <p className="text-muted-foreground text-sm">
          Ask questions about accessibility. Context includes your latest scan summary when available.
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
        <ScrollArea className="min-h-[200px] flex-1 rounded-md border p-3">
          <div className="space-y-3" role="log" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">No messages yet.</p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="text-muted-foreground font-medium">{m.role === "user" ? "You" : "Assistant"}: </span>
                  <span className="whitespace-pre-wrap">{m.content}</span>
                </div>
              ))
            )}
            {loading ? <p className="text-muted-foreground text-sm">Thinking…</p> : null}
          </div>
        </ScrollArea>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. How do I prioritize these issues?"
            rows={2}
            className="min-h-[72px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            aria-label="Chat message"
          />
          <Button type="button" className="self-end" onClick={() => void handleSend()} disabled={loading || !input.trim()}>
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
        {!scanSummary || scanSummary.total === 0 ? (
          <p className="text-muted-foreground text-xs">Run a scan to attach live result context to the assistant.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
