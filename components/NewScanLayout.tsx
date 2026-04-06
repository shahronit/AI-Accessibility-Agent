"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Globe, Loader2, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateScanUrl } from "@/lib/url";
import { WCAG_PRESET_OPTIONS, type WcagPresetId } from "@/lib/wcagAxeTags";

export type NewScanOptions = {
  wcagPreset: WcagPresetId;
  deepScan: boolean;
  requiresLogin: boolean;
};

type Props = {
  url: string;
  onUrlChange: (value: string) => void;
  scanLoading: boolean;
  /** Disables Start only while the findings summary is waiting for “Show results”. */
  awaitingResultReveal?: boolean;
  scanError: string | null;
  onStartScan: (opts: NewScanOptions) => void;
  /** Inline voice agent (mic + typed commands) beside Start scan. */
  voiceControl?: ReactNode;
};

export function NewScanLayout({
  url,
  onUrlChange,
  scanLoading,
  awaitingResultReveal = false,
  scanError,
  onStartScan,
  voiceControl,
}: Props) {
  const [wcagPreset, setWcagPreset] = useState<WcagPresetId>("wcag21-aa");
  const [deepScan, setDeepScan] = useState(true);
  const [requiresLogin, setRequiresLogin] = useState(false);

  const debouncedUrl = useDebouncedValue(url, 400);
  const urlValidation = useMemo(() => validateScanUrl(debouncedUrl), [debouncedUrl]);
  const [urlTouched, setUrlTouched] = useState(false);
  const urlShowError = urlTouched && debouncedUrl.trim() !== "" && !urlValidation.ok;

  const scanOpts = useMemo(
    (): NewScanOptions => ({
      wcagPreset,
      deepScan,
      requiresLogin,
    }),
    [wcagPreset, deepScan, requiresLogin],
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="new-scan-url" className="text-sm font-medium text-zinc-200">
          Website URL
        </Label>
        <div className="relative">
          <Globe
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="new-scan-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onBlur={() => setUrlTouched(true)}
            aria-invalid={urlShowError}
            disabled={scanLoading}
            className="h-11 border-white/10 bg-black/35 pl-10 font-mono text-sm"
          />
        </div>
        {urlShowError ? (
          <p className="text-destructive text-sm" role="alert">
            {urlValidation.ok ? null : urlValidation.error}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="wcag-level" className="text-sm font-medium text-zinc-200">
          How strict should the check be?
        </Label>
        <select
          id="wcag-level"
          value={wcagPreset}
          onChange={(e) => setWcagPreset(e.target.value as WcagPresetId)}
          disabled={scanLoading}
          className="border-input focus-visible:ring-ring h-11 w-full rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-zinc-100 outline-none focus-visible:ring-2"
        >
          {WCAG_PRESET_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 rounded-lg border border-white/[0.07] bg-black/25 p-4">
        <label className="flex cursor-pointer gap-3">
          <input
            type="checkbox"
            checked={deepScan}
            onChange={(e) => setDeepScan(e.target.checked)}
            disabled={scanLoading}
            className="accent-emerald-500 mt-0.5 size-4 shrink-0 rounded border-white/20"
          />
          <span>
            <span className="text-sm font-medium text-zinc-100">Thorough single-page pass</span>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              After the page loads, the tool presses Tab many times so hidden menus and dialogs are more likely to be
              checked. Still one page only.
            </p>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3">
          <input
            type="checkbox"
            checked={requiresLogin}
            onChange={(e) => setRequiresLogin(e.target.checked)}
            disabled={scanLoading}
            className="accent-emerald-500 mt-0.5 size-4 shrink-0 rounded border-white/20"
          />
          <span>
            <span className="text-sm font-medium text-zinc-100">Page may need a sign-in</span>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Reminder: this tool doesn&apos;t use your browser login. Password-protected pages are usually checked as
              if you were logged out.
            </p>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <Button
            type="button"
            disabled={scanLoading || awaitingResultReveal || !url.trim()}
            className="h-11 w-full shrink-0 gap-2 bg-emerald-600 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 disabled:opacity-60 sm:min-w-[10.5rem] sm:flex-1"
            onClick={() => onStartScan(scanOpts)}
            title={
              awaitingResultReveal
                ? "Open the full findings list with Show results in the panel below first."
                : undefined
            }
          >
            {scanLoading ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Scanning…
              </>
            ) : awaitingResultReveal ? (
              <span className="flex items-center justify-center gap-2 text-emerald-100/95">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-400" aria-hidden />
                Review findings below
              </span>
            ) : (
              <>
                <Play className="size-4 fill-current" aria-hidden />
                Start scan
              </>
            )}
          </Button>
          {voiceControl ? (
            <div className="flex min-h-[2.75rem] min-w-0 flex-1 items-center sm:justify-end">{voiceControl}</div>
          ) : null}
        </div>
      </div>

      {scanError ? (
        <Alert variant="destructive" className="border-red-500/40 bg-red-950/30">
          <AlertTitle className="text-sm">Scan error</AlertTitle>
          <AlertDescription className="text-sm">{scanError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
