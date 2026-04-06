"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ScanWorkspacePage from "@/components/ScanWorkspacePage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ScanFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8" aria-busy="true">
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
        Loading scanner…
      </p>
      <Skeleton className="h-10 w-full max-w-md" />
      <Card className="agent-card">
        <CardHeader>
          <CardTitle className="text-base">Loading scanner…</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<ScanFallback />}>
      <ScanWorkspacePage />
    </Suspense>
  );
}
