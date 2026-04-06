import { Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";

function AppRouteFallback() {
  return (
    <div
      className="text-muted-foreground flex items-center gap-2 p-8 text-sm"
      role="status"
      aria-busy="true"
    >
      <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
      Loading…
    </div>
  );
}

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<AppRouteFallback />}>{children}</Suspense>
    </AppShell>
  );
}
