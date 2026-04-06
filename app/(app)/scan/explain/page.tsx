"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ScanIssueExplainWorkspace } from "@/components/ScanIssueExplainWorkspace";
import { Skeleton } from "@/components/ui/skeleton";

function ExplainFallback() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12" aria-busy="true">
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
        Loading…
      </p>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

export default function ScanExplainPage() {
  return (
    <Suspense fallback={<ExplainFallback />}>
      <ScanIssueExplainWorkspace />
    </Suspense>
  );
}
