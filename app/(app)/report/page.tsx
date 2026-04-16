"use client";

import { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, ScanSearch } from "lucide-react";
import { ScanFindingsReport } from "@/components/ScanFindingsReport";
import { useScanSession } from "@/components/ScanSessionProvider";
import { useAuth, authHeaders } from "@/components/AuthProvider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScanIssue } from "@/lib/axeScanner";
import { dashboardScanUrlKey, findLatestHistoryForUrl } from "@/lib/scanHistory";

function issuesFromSample(sample: Pick<ScanIssue, "id" | "impact" | "description">[]): ScanIssue[] {
  return sample.map((row, i) => ({
    index: i + 1,
    id: row.id,
    description: row.description,
    impact: row.impact,
    html: "",
    helpUrl: "",
  }));
}

function mergeViolationsAndReview(violations: ScanIssue[], review: ScanIssue[]): ScanIssue[] {
  const r = review.map((issue, i) => ({
    ...issue,
    index: violations.length + i + 1,
    kind: "needs_review" as const,
  }));
  return [...violations, ...r];
}

function ReportContent() {
  const searchParams = useSearchParams();
  const { scannedUrl: sessionUrl, issues: sessionIssues, reviewIssues: sessionReviewIssues } = useScanSession();

  const resolved = useMemo(() => {
    const raw = searchParams.get("url")?.trim();
    if (!raw) return { kind: "no-url" as const };

    if (
      sessionUrl &&
      dashboardScanUrlKey(sessionUrl) === dashboardScanUrlKey(raw) &&
      (sessionIssues.length > 0 || sessionReviewIssues.length > 0)
    ) {
      return {
        kind: "ok" as const,
        scannedUrl: sessionUrl,
        issues: mergeViolationsAndReview(sessionIssues, sessionReviewIssues),
        savedAt: null as string | null,
        showSampleNotice: false,
        totalIssuesHint: undefined as number | undefined,
        needsReview: sessionReviewIssues.length,
      };
    }

    const hist = findLatestHistoryForUrl(raw);
    const histViolations = hist?.issues ?? [];
    const histReview = hist?.reviewIssues ?? [];
    if (hist && (histViolations.length > 0 || histReview.length > 0)) {
      const merged = mergeViolationsAndReview(histViolations, histReview);
      const cappedViol = hist.totalIssues > histViolations.length;
      const cappedRev = (hist.totalReviewIssues ?? 0) > histReview.length;
      const partial = cappedViol || cappedRev;
      const hintTotal = hist.totalIssues + (hist.totalReviewIssues ?? 0);
      return {
        kind: "ok" as const,
        scannedUrl: hist.scannedUrl || raw,
        issues: merged,
        savedAt: hist.savedAt,
        showSampleNotice: partial,
        totalIssuesHint: partial && hintTotal > merged.length ? hintTotal : undefined,
        needsReview: hist.incompleteInstances ?? histReview.length,
      };
    }

    if (hist?.issuesSample && hist.issuesSample.length > 0) {
      return {
        kind: "ok" as const,
        scannedUrl: hist.scannedUrl || raw,
        issues: issuesFromSample(hist.issuesSample),
        savedAt: hist.savedAt,
        showSampleNotice: true,
        totalIssuesHint: hist.totalIssues,
        needsReview: hist.incompleteInstances,
      };
    }

    return { kind: "empty" as const, url: raw };
  }, [searchParams, sessionUrl, sessionIssues, sessionReviewIssues]);

  if (resolved.kind === "no-url") {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12">
        <h1 className="text-foreground text-lg font-semibold">No URL in link</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Open this report from the dashboard &quot;View results&quot; action, or include a <code className="text-foreground">url</code>{" "}
          query parameter.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (resolved.kind === "empty") {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-12">
        <h1 className="text-foreground text-lg font-semibold">No saved findings for this page</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Run a scan for this URL first. After the scan completes, you can open the full report from the dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/scan?url=${encodeURIComponent(resolved.url)}`}
            className={cn(buttonVariants({ size: "sm" }), "inline-flex items-center gap-1.5")}
          >
            <ScanSearch className="size-4" aria-hidden />
            Scan this URL
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <ServerReportExport />
      <ScanFindingsReport
        scannedUrl={resolved.scannedUrl}
        issues={resolved.issues}
        savedAt={resolved.savedAt}
        showSampleNotice={resolved.showSampleNotice}
        totalIssuesHint={resolved.totalIssuesHint}
        needsReview={resolved.needsReview ?? 0}
      />
    </>
  );
}

function ServerReportExport() {
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const scanId = searchParams.get("scanId");

  const downloadReport = useCallback(async (format: "pdf" | "csv") => {
    if (!scanId || !token) return;
    try {
      const res = await fetch(`/api/reports/${scanId}/${format}`, {
        headers: authHeaders(token),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `a11y-report-${scanId.slice(0, 8)}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* download failed silently */
    }
  }, [scanId, token]);

  if (!scanId || !token) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-4 sm:px-6">
      <span className="text-muted-foreground text-xs">Server report:</span>
      <button
        type="button"
        onClick={() => downloadReport("pdf")}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
      >
        <Download className="size-3.5" />
        Download PDF
      </button>
      <button
        type="button"
        onClick={() => downloadReport("csv")}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
      >
        <FileSpreadsheet className="size-3.5" />
        Download CSV
      </button>
    </div>
  );
}

function ReportFallback() {
  return (
    <div className="space-y-6 px-4 py-6" aria-busy="true">
      <p className="text-muted-foreground flex items-center gap-2 text-sm" role="status">
        <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
        Loading report…
      </p>
      <Skeleton className="h-40 w-full max-w-3xl rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<ReportFallback />}>
      <ReportContent />
    </Suspense>
  );
}
