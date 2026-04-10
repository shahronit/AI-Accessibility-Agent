"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { DashboardOverview } from "@/components/DashboardOverview";
import { useScanSession } from "@/components/ScanSessionProvider";
import { loadScanHistory, type HistoryEntry } from "@/lib/scanHistory";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { issues, scanActivity } = useScanSession();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const refreshHistory = useCallback(() => {
    setHistory(loadScanHistory());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from localStorage after mount
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    const u = searchParams.get("url");
    if (u?.trim()) {
      router.replace(`/scan?url=${encodeURIComponent(u.trim())}`);
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-full">
      <DashboardOverview
        history={history}
        scanLoading={scanActivity.inProgress}
        pendingScanUrl={scanActivity.pendingUrl ?? ""}
        issues={issues}
        onNewScanClick={() => router.push("/scan")}
        onViewResults={(url) => router.push(`/report?url=${encodeURIComponent(url)}`)}
      />
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="dashboard-overview space-y-6 px-4 py-6" aria-busy="true">
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
        Loading dashboard…
      </p>
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
