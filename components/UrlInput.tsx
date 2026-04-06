"use client";

import { useMemo, useState } from "react";
import { Globe, Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateScanUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

type Props = {
  url: string;
  onUrlChange: (value: string) => void;
  onScan: () => void;
  loading?: boolean;
  /** Defaults to `scan-url` so multiple inputs on the site stay accessible. */
  fieldId?: string;
  /** When false, only the URL field is shown (use a custom action button elsewhere). */
  showScanButton?: boolean;
  /** When true, shows a short hint under the field (use on the main scanner only). */
  showHint?: boolean;
};

export function UrlInput({
  url,
  onUrlChange,
  onScan,
  loading,
  fieldId = "scan-url",
  showScanButton = true,
  showHint = false,
}: Props) {
  const debounced = useDebouncedValue(url, 400);
  const validation = useMemo(() => validateScanUrl(debounced), [debounced]);

  const [touched, setTouched] = useState(false);
  const showError = touched && debounced.trim() !== "" && !validation.ok;

  return (
    <div className="space-y-3">
      <Label htmlFor={fieldId} className="flex items-center gap-2 text-sm font-medium">
        <Globe className="text-primary size-4" aria-hidden />
        Target URL
      </Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative sm:min-w-0 sm:flex-1">
          <Globe
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id={fieldId}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={showError}
            aria-describedby={
              showError ? `${fieldId}-error` : showHint ? `${fieldId}-hint` : undefined
            }
            className={cn("h-11 pl-10 font-mono text-sm")}
          />
        </div>
        {showScanButton ? (
          <Button
            type="button"
            onClick={onScan}
            disabled={loading || !url.trim()}
            className="h-11 shrink-0 gap-2 font-medium shadow-lg shadow-primary/20"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Scanning…
              </>
            ) : (
              <>
                <ScanSearch className="size-4" aria-hidden />
                Run scan
              </>
            )}
          </Button>
        ) : null}
      </div>
      {showError ? (
        <p id={`${fieldId}-error`} className="text-destructive text-sm" role="alert">
          {validation.ok ? null : validation.error}
        </p>
      ) : showHint ? (
        <p id={`${fieldId}-hint`} className="text-muted-foreground text-sm">
          Public <span className="font-mono text-xs">https</span> URLs only (server-side scan).
        </p>
      ) : null}
    </div>
  );
}
