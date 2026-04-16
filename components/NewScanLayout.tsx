"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardCopy, ExternalLink, Globe, Loader2, Play } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ScanMethodologyPanel } from "@/components/ScanMethodologyPanel";
import { Textarea } from "@/components/ui/textarea";
import type { ScanSetCookie } from "@/lib/scanCookies";
import { copyTextToClipboard } from "@/lib/copyText";
import { validateScanUrl } from "@/lib/url";
import { WCAG_PRESET_OPTIONS, type WcagPresetId } from "@/lib/wcagAxeTags";

export type NewScanOptions = {
  wcagPreset: WcagPresetId;
  deepScan: boolean;
  requiresLogin: boolean;
  /** Parsed cookie jar; server validates domains against the scan URL. */
  cookies?: ScanSetCookie[];
  /** Multi-page crawl + scan (requires auth) */
  multiPage?: boolean;
  /** Max pages for multi-page scan */
  maxPages?: number;
};

type Props = {
  url: string;
  onUrlChange: (value: string) => void;
  /** When opening /scan?requiresLogin=1 (e.g. from a link or tool). */
  defaultRequiresLogin?: boolean;
  scanLoading: boolean;
  /** Disables Start only while the findings summary is waiting for “Show results”. */
  awaitingResultReveal?: boolean;
  scanError: string | null;
  onStartScan: (opts: NewScanOptions) => void;
  /** Inline voice agent (mic + typed commands) beside Start scan. */
  voiceControl?: ReactNode;
  /** Whether the user is authenticated (unlocks multi-page options). */
  isAuthenticated?: boolean;
};

export function NewScanLayout({
  url,
  onUrlChange,
  defaultRequiresLogin = false,
  scanLoading,
  awaitingResultReveal = false,
  scanError,
  onStartScan,
  voiceControl,
  isAuthenticated = false,
}: Props) {
  const [wcagPreset, setWcagPreset] = useState<WcagPresetId>("wcag21-aa");
  const [deepScan, setDeepScan] = useState(true);
  const [requiresLogin, setRequiresLogin] = useState(() => Boolean(defaultRequiresLogin));

  const [multiPage, setMultiPage] = useState(false);
  const [maxPages, setMaxPages] = useState(5);
  const [cookieImportText, setCookieImportText] = useState("");

  const debouncedUrl = useDebouncedValue(url, 400);
  const urlValidation = useMemo(() => validateScanUrl(debouncedUrl), [debouncedUrl]);
  const [urlTouched, setUrlTouched] = useState(false);
  const urlShowError = urlTouched && debouncedUrl.trim() !== "" && !urlValidation.ok;

  const cookieImportState = useMemo(() => {
    if (!requiresLogin) {
      return { cookies: undefined as ScanSetCookie[] | undefined, error: null as string | null };
    }
    const t = cookieImportText.trim();
    if (!t) {
      return { cookies: undefined as ScanSetCookie[] | undefined, error: null as string | null };
    }
    try {
      const v = JSON.parse(t) as unknown;
      if (!Array.isArray(v)) {
        return { cookies: undefined as ScanSetCookie[] | undefined, error: "Cookies must be a JSON array." };
      }
      return { cookies: v as ScanSetCookie[], error: null as string | null };
    } catch {
      return { cookies: undefined as ScanSetCookie[] | undefined, error: "Invalid JSON in cookie import." };
    }
  }, [requiresLogin, cookieImportText]);

  const scanOpts = useMemo(
    (): NewScanOptions => ({
      wcagPreset,
      deepScan,
      requiresLogin,
      cookies:
        cookieImportState.error || !cookieImportState.cookies?.length
          ? undefined
          : cookieImportState.cookies,
      multiPage: isAuthenticated && multiPage ? true : undefined,
      maxPages: isAuthenticated && multiPage ? maxPages : undefined,
    }),
    [wcagPreset, deepScan, requiresLogin, cookieImportState.error, cookieImportState.cookies, isAuthenticated, multiPage, maxPages],
  );

  const loginPrepUrl = useMemo(() => validateScanUrl(url), [url]);
  const showSignInPrep = requiresLogin && loginPrepUrl.ok;
  const [copyHint, setCopyHint] = useState<string | null>(null);

  useEffect(() => {
    if (!copyHint) return;
    const t = window.setTimeout(() => setCopyHint(null), 2500);
    return () => window.clearTimeout(t);
  }, [copyHint]);

  const openTargetInNewWindow = useCallback(() => {
    if (!loginPrepUrl.ok) return;
    const w = window.open(loginPrepUrl.url, "_blank", "noopener,noreferrer");
    if (w == null) {
      setCopyHint("Pop-up blocked — use Copy URL and open the link manually.");
    }
  }, [loginPrepUrl]);

  const copyTargetUrl = useCallback(async () => {
    if (!loginPrepUrl.ok) return;
    const ok = await copyTextToClipboard(loginPrepUrl.url);
    setCopyHint(
      ok
        ? "URL copied to clipboard."
        : "Could not copy automatically — select the URL in the address bar after opening the site.",
    );
  }, [loginPrepUrl]);

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
        {requiresLogin ? (
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            Sign-in: after login, put the <strong className="text-zinc-400">exact final URL</strong> from the other
            tab&apos;s address bar into <strong className="text-zinc-400">Website URL</strong>, then use{" "}
            <strong className="text-zinc-400">Sign-in prep</strong> below.
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

      <ScanMethodologyPanel
        context={{
          deepScan,
          voiceAssistantAvailable: Boolean(voiceControl),
        }}
      />

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
              Rule-based linter plus better DOM coverage: after load, the scanner sends many Tab keypresses so more
              widgets (menus, dialogs) exist in the DOM before axe runs. Not a screen reader—see the methodology panel
              above. One page only.
            </p>
          </span>
        </label>
        <label className="flex cursor-pointer gap-3">
          <input
            id="new-scan-requires-login"
            type="checkbox"
            checked={requiresLogin}
            onChange={(e) => {
              const checked = e.target.checked;
              setRequiresLogin(checked);
              if (!checked) setCookieImportText("");
            }}
            disabled={scanLoading}
            className="accent-emerald-500 mt-0.5 size-4 shrink-0 rounded border-white/20"
          />
          <span>
            <span className="text-sm font-medium text-zinc-100">Page may need a sign-in</span>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              When checked, use the <strong className="text-zinc-300">Sign-in prep</strong> panel (appears below for a
              valid URL) to open the site in your own browser, sign in or finish booking, optionally paste cookies for
              an authenticated server scan, then run <strong className="text-zinc-300">Start scan</strong>.
            </p>
          </span>
        </label>

        {showSignInPrep ? (
          <div
            className="border-border/60 mt-2 rounded-lg border border-cyan-500/20 bg-cyan-950/15 p-4"
            role="region"
            aria-labelledby="sign-in-prep-heading"
          >
            <h3 id="sign-in-prep-heading" className="text-sm font-semibold text-cyan-100">
              Sign-in prep
            </h3>
            <ol className="text-muted-foreground mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                Open the target site in a <strong className="text-zinc-300">new window</strong> (your normal browser,
                with your passwords and SSO).
              </li>
              <li>Sign in, complete booking, or reach the screen you want scanned.</li>
              <li>
                If the <strong className="text-zinc-300">address bar URL changed</strong> after login, copy the{" "}
                <strong className="text-zinc-300">final URL</strong> into <strong className="text-zinc-300">Website URL</strong>{" "}
                above. The server scans whatever is in that field.
              </li>
              <li>
                Come back here and press <strong className="text-zinc-300">Start scan</strong> when ready. Optional{" "}
                <strong className="text-zinc-300">cookie import</strong> (below) must match the same host as that URL.
              </li>
            </ol>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="secondary"
                className="h-10 gap-2 border-cyan-500/30 bg-cyan-950/40 text-cyan-50 hover:bg-cyan-900/50"
                onClick={openTargetInNewWindow}
                disabled={scanLoading}
              >
                <ExternalLink className="size-4 shrink-0" aria-hidden />
                Open site in new window
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 border-white/15 bg-black/30 text-zinc-100 hover:bg-white/5"
                onClick={() => void copyTargetUrl()}
                disabled={scanLoading}
              >
                <ClipboardCopy className="size-4 shrink-0" aria-hidden />
                Copy URL
              </Button>
            </div>
            {copyHint ? (
              <p className="text-muted-foreground mt-3 text-xs" role="status" aria-live="polite">
                {copyHint}
              </p>
            ) : null}

            <details className="border-border/60 mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-200">
                Import session cookies (advanced)
              </summary>
              <div className="text-muted-foreground mt-3 space-y-3 text-xs leading-relaxed">
                <p>
                  <strong className="text-zinc-400">Use the same final URL</strong> in <strong className="text-zinc-400">Website URL</strong> as the page you want scanned. Each cookie&apos;s{" "}
                  <code className="text-zinc-400">domain</code> must match that URL&apos;s host (the server checks this).
                </p>
                <p>
                  After signing in, export cookies for this site (Chrome: DevTools → Application → Cookies → select
                  the site → copy as JSON where available, or use a trusted exporter). Paste a{" "}
                  <strong className="text-zinc-400">JSON array</strong> of objects with{" "}
                  <code className="text-zinc-400">name</code>, <code className="text-zinc-400">value</code>,{" "}
                  <code className="text-zinc-400">domain</code>, <code className="text-zinc-400">path</code> (and
                  optionally <code className="text-zinc-400">expires</code>, <code className="text-zinc-400">secure</code>
                  , <code className="text-zinc-400">httpOnly</code>, <code className="text-zinc-400">sameSite</code>).
                </p>
                <p>
                  <strong className="text-zinc-400">HttpOnly</strong> cookies only appear in DevTools exports, not from
                  page JavaScript. Cookies are sent to the server once per scan and are not stored by this app.
                </p>
                <Textarea
                  value={cookieImportText}
                  onChange={(e) => setCookieImportText(e.target.value)}
                  disabled={scanLoading}
                  placeholder={`[\n  { "name": "session", "value": "…", "domain": ".example.com", "path": "/" }\n]`}
                  className="min-h-[7rem] border-white/10 bg-black/40 font-mono text-xs"
                  aria-invalid={Boolean(cookieImportState.error)}
                  spellCheck={false}
                />
                {cookieImportState.error ? (
                  <p className="text-destructive text-xs" role="alert">
                    {cookieImportState.error}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setCookieImportText("")}
                  disabled={scanLoading || !cookieImportText.trim()}
                >
                  Clear cookie import
                </Button>
              </div>
            </details>

            <p className="text-muted-foreground mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed">
              <strong className="text-zinc-400">Privacy:</strong> scans run in a{" "}
              <strong className="text-zinc-400">headless browser on the server</strong>. If you import cookies, they
              are applied only for that request and are not persisted here.
            </p>
          </div>
        ) : requiresLogin && !loginPrepUrl.ok ? (
          <p className="text-muted-foreground mt-2 text-sm" role="status">
            Enter a valid <strong className="text-zinc-400">http(s)</strong> URL above to show sign-in prep steps.
          </p>
        ) : null}
      </div>

      {isAuthenticated && (
        <div className="space-y-3 rounded-lg border border-white/[0.07] bg-black/25 p-4">
          <label className="flex cursor-pointer gap-3">
            <input
              type="checkbox"
              checked={multiPage}
              onChange={(e) => setMultiPage(e.target.checked)}
              disabled={scanLoading}
              className="accent-emerald-500 mt-0.5 size-4 shrink-0 rounded border-white/20"
            />
            <span>
              <span className="text-sm font-medium text-zinc-100">Multi-page scan</span>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                Discover pages via sitemap and link-following, then scan each page.
                Results are saved to the database and available in reports.
              </p>
            </span>
          </label>
          {multiPage && (
            <div className="ml-7 space-y-2">
              <Label htmlFor="max-pages" className="text-sm font-medium text-zinc-300">
                Max pages to scan: {maxPages}
              </Label>
              <input
                id="max-pages"
                type="range"
                min={1}
                max={20}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                disabled={scanLoading}
                className="w-full accent-emerald-500"
              />
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>1</span>
                <span>20</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <Button
            type="button"
            disabled={
              scanLoading ||
              awaitingResultReveal ||
              !url.trim() ||
              Boolean(cookieImportState.error && cookieImportText.trim())
            }
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
