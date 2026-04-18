"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Loader2, XCircle, Globe, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProgressEvent {
  phase: string;
  message: string;
  pagesScanned: number;
  pagesTotal: number;
  score: number | null;
}

interface ScanProgressPanelProps {
  scanId: string;
  onComplete?: (scanId: string) => void;
  onCancel?: () => void;
}

export function ScanProgressPanel({ scanId, onComplete, onCancel }: ScanProgressPanelProps) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!scanId || !isAuthenticated) return;

    const controller = new AbortController();
    abortRef.current = controller;

    async function stream() {
      try {
        const res = await fetch(`/api/scan/${scanId}/progress`, {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setError("Failed to connect to scan progress");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const chunk of lines) {
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const evt = JSON.parse(dataLine.slice(6)) as ProgressEvent;
              setProgress(evt);
              if (evt.phase === "completed" || evt.phase === "failed" || evt.phase === "cancelled") {
                setDone(true);
                if (evt.phase === "completed") onComplete?.(scanId);
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Connection lost");
        }
      }
    }

    stream();
    return () => controller.abort();
  }, [scanId, isAuthenticated, onComplete]);

  const handleCancel = useCallback(async () => {
    if (!isAuthenticated) return;
    abortRef.current?.abort();
    await fetch(`/api/scan/${scanId}`, { method: "DELETE" }).catch(() => {});
    onCancel?.();
  }, [scanId, isAuthenticated, onCancel]);

  const pct = progress && progress.pagesTotal > 0
    ? Math.round((progress.pagesScanned / progress.pagesTotal) * 100)
    : 0;

  const phaseIcon = progress?.phase === "completed"
    ? <CheckCircle2 className="size-5 text-emerald-400" />
    : progress?.phase === "failed"
    ? <XCircle className="size-5 text-red-400" />
    : progress?.phase === "cancelled"
    ? <Ban className="size-5 text-yellow-400" />
    : progress?.phase === "crawling"
    ? <Globe className="size-5 animate-pulse text-blue-400" />
    : <Loader2 className="size-5 animate-spin text-emerald-400" />;

  return (
    <div className="border-border/60 bg-card/80 space-y-4 rounded-2xl border p-6 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {phaseIcon}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium capitalize">
            {progress?.phase || "Initializing..."}
          </p>
          <p className="text-muted-foreground text-xs">{progress?.message || "Starting scan..."}</p>
        </div>
        {progress?.score != null && (
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-emerald-400">
              {progress.score}
            </p>
            <p className="text-muted-foreground text-xs">score</p>
          </div>
        )}
      </div>

      {progress && progress.pagesTotal > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {progress.pagesScanned} / {progress.pagesTotal} pages
            </span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progress.phase === "completed" ? "bg-emerald-500" : "bg-emerald-500/70",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {!done && (
        <button
          type="button"
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground text-xs hover:underline"
        >
          Cancel scan
        </button>
      )}

      {done && progress?.phase === "completed" && (
        <p className="text-xs text-emerald-400">
          Scan complete. View results in the report page.
        </p>
      )}
    </div>
  );
}
