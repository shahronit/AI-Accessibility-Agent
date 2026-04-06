"use client";

import { CheckCircle2, ListChecks, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ScanLogLine = { id: string; text: string };

type Props = {
  phase: "scanning" | "summary";
  pagesLabel: string;
  violationsCount: number;
  logLines: ScanLogLine[];
  onCancel: () => void;
  /** Shown in summary phase — reveals the findings list. */
  onShowResults?: () => void;
};

export function ScanInProgressPanel({
  phase,
  pagesLabel,
  violationsCount,
  logLines,
  onCancel,
  onShowResults,
}: Props) {
  const isScanning = phase === "scanning";
  const violationsClass =
    violationsCount === 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div
      className="flex flex-col items-center rounded-xl border border-white/[0.08] bg-zinc-950/80 px-5 py-8 sm:px-8"
      aria-busy={isScanning}
      aria-label={isScanning ? "Scan in progress" : "Scan complete — summary"}
    >
      <div
        className="relative mb-5 flex size-16 items-center justify-center"
        role="status"
        aria-label={isScanning ? "Loading" : "Complete"}
      >
        {isScanning ? (
          <>
            <div
              className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-teal-400 border-r-violet-500 border-b-teal-500/30 border-l-violet-400/40 animate-spin"
              aria-hidden
            />
            <div
              className="absolute inset-1 rounded-full border border-white/[0.06] bg-zinc-900/90"
              aria-hidden
            />
          </>
        ) : (
          <CheckCircle2
            className="size-14 shrink-0 text-emerald-400"
            strokeWidth={2}
            aria-hidden
          />
        )}
      </div>

      <h3 className="text-base font-semibold tracking-tight text-zinc-50">
        {isScanning ? "Scanning…" : "Scan complete"}
      </h3>
      {!isScanning ? (
        <p className="text-muted-foreground mt-1 max-w-md text-center text-sm leading-relaxed">
          Review the summary below, then open the full findings list.
        </p>
      ) : null}

      <div className="my-6 h-px w-full max-w-md bg-white/10" role="presentation" />

      <div className="grid w-full max-w-md grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-sm font-medium text-zinc-100">{pagesLabel}</p>
          <p className="text-muted-foreground mt-1 text-sm">Pages</p>
        </div>
        <div>
          <p className={cn("text-lg font-semibold tabular-nums", violationsClass)}>{violationsCount}</p>
          <p className="text-muted-foreground mt-1 text-sm">Violations</p>
        </div>
      </div>

      <div className="mt-6 w-full max-w-md">
        <p className="text-muted-foreground mb-2 text-left text-[11px] font-semibold tracking-wide uppercase">
          Live agent activity
        </p>
        <div className="rounded-lg border border-white/[0.06] bg-black/40 px-3 py-3 font-mono text-sm leading-relaxed text-zinc-300">
          <ul className="space-y-1.5">
            {logLines.map((line) => (
              <li key={line.id} className="break-words whitespace-pre-wrap">
                {line.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isScanning ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-6 gap-2 border-red-500/40 bg-transparent text-red-400 hover:bg-red-950/40 hover:text-red-300"
          onClick={onCancel}
        >
          <Square className="size-3.5 fill-current" aria-hidden />
          Cancel scan
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          className="mt-6 gap-2 bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
          onClick={onShowResults}
        >
          <ListChecks className="size-4 shrink-0" aria-hidden />
          Show results
        </Button>
      )}
    </div>
  );
}
