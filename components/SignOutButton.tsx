"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { signOut } from "@/components/AuthProvider";
import { cn } from "@/lib/utils";

/**
 * Reusable sign-out button. Wraps the shared `signOut` helper from
 * `@/components/AuthProvider` (which both signs out of Firebase and
 * deletes the server `__session` cookie).
 *
 * Two visual variants are supported via `compact`: text+icon for the
 * normal sidebar block, and icon-only for the collapsed sidebar.
 */

interface Props {
  compact?: boolean;
  className?: string;
  callbackUrl?: string;
}

export function SignOutButton({ compact = false, className, callbackUrl = "/" }: Props) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signOut({ callbackUrl });
        } finally {
          setPending(false);
        }
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg text-xs font-medium hover:underline disabled:opacity-50",
        compact ? "justify-center px-2 py-2" : "px-0",
        className,
      )}
      aria-label="Sign out"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : compact ? (
        <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
      ) : null}
      {compact ? null : "Sign out"}
    </button>
  );
}
