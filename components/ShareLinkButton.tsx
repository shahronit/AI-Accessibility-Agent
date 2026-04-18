"use client";

import { useCallback, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Fix 7 - small client island for the otherwise-server `/report/[scanId]`
 * page. Copies an absolute URL (preferred) or falls back to the relative
 * path passed by the server when `window.location.origin` is unavailable.
 *
 * Avoids `window.location` for navigation per the brief - this only writes
 * to the clipboard and never replaces the page.
 */
export function ShareLinkButton({
  path,
  label = "Share",
  className,
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    const href = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
      } else {
        // Older browsers / iframes without Clipboard API. We avoid
        // document.execCommand to stay future-proof and simply prompt.
        window.prompt("Copy this link:", href);
      }
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Use the address bar to copy this URL.");
      window.setTimeout(() => setError(null), 4000);
    }
  }, [path]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1.5", className)}
        onClick={onClick}
        aria-live="polite"
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
        {copied ? "Link copied" : label}
      </Button>
      {error ? (
        <p className="text-destructive text-xs" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
