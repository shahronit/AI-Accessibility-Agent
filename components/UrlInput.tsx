"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateScanUrl } from "@/lib/url";

type Props = {
  url: string;
  onUrlChange: (value: string) => void;
  onScan: () => void;
  loading?: boolean;
};

export function UrlInput({ url, onUrlChange, onScan, loading }: Props) {
  const debounced = useDebouncedValue(url, 400);
  const validation = useMemo(() => validateScanUrl(debounced), [debounced]);

  const [touched, setTouched] = useState(false);
  const showError = touched && debounced.trim() !== "" && !validation.ok;

  return (
    <div className="space-y-2">
      <Label htmlFor="scan-url">Website URL</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id="scan-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError}
          aria-describedby={showError ? "scan-url-error" : undefined}
          className="sm:flex-1"
        />
        <Button type="button" onClick={onScan} disabled={loading || !url.trim()} className="shrink-0">
          {loading ? "Scanning…" : "Scan accessibility"}
        </Button>
      </div>
      {showError ? (
        <p id="scan-url-error" className="text-destructive text-sm" role="alert">
          {validation.ok ? null : validation.error}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">Enter a public http(s) URL. Scans run on our server to avoid browser CORS limits.</p>
      )}
    </div>
  );
}
