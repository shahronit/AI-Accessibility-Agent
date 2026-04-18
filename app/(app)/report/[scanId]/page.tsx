import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { auth } from "@/auth";
import { ScanFindingsReport } from "@/components/ScanFindingsReport";
import { ShareLinkButton } from "@/components/ShareLinkButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanIssue } from "@/lib/axeScanner";
import { getScanById } from "@/lib/scan-store";
import { WCAG_PRESET_OPTIONS, type WcagPresetId } from "@/lib/wcagAxeTags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fix 7 - shareable, server-rendered scan report fetched from the Upstash
 * `scan:id:{id}` bucket. Auth-gated like `/api/scan-history` because the
 * KV store is not user-scoped and could expose URLs scanned by other
 * tenants. 404s when:
 *   - the scanId has expired (30-day TTL on the body)
 *   - Upstash is not configured (KV reads return null in dev)
 *   - the param is malformed.
 */

function wcagLabelFor(preset: WcagPresetId): string {
  const found = WCAG_PRESET_OPTIONS.find((o) => o.id === preset);
  return found?.label ?? "WCAG 2.1 Level AA";
}

function mergeViolationsAndReview(violations: ScanIssue[], review: ScanIssue[]): ScanIssue[] {
  const renumberedReview = review.map((issue, i) => ({
    ...issue,
    index: violations.length + i + 1,
    kind: "needs_review" as const,
  }));
  return [...violations, ...renumberedReview];
}

type Params = { scanId: string };

export default async function ReportByIdPage({ params }: { params: Promise<Params> }) {
  const session = await auth();
  if (!session?.user?.id) {
    // Push the user to sign-in and bring them back to this exact report.
    const { scanId } = await params;
    const callback = encodeURIComponent(`/report/${scanId}`);
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12">
        <Card className="agent-card">
          <CardHeader>
            <CardTitle className="text-lg">Sign in to view this report</CardTitle>
            <CardDescription>
              Reports are stored in your team&apos;s shared Upstash store and require an account
              to view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/signin?callbackUrl=${callback}`}
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { scanId } = await params;
  if (!scanId || scanId.length > 128) notFound();

  const scan = await getScanById(scanId);
  if (!scan) notFound();

  const issues = mergeViolationsAndReview(scan.issues ?? [], scan.reviewIssues ?? []);
  const wcagLabel = wcagLabelFor(scan.wcagPreset);
  const sharePath = `/report/${scanId}`;
  const rescanHref = `/scan?url=${encodeURIComponent(scan.url)}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/history"
            className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to history
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Saved scan report</h1>
          <p className="text-muted-foreground text-sm">
            Scanned <span className="text-zinc-200">{new Date(scan.scannedAt).toLocaleString()}</span>
            {" · "}
            {scan.issues.length} violation{scan.issues.length === 1 ? "" : "s"}
            {" · "}
            {scan.reviewIssues.length} needs review
            {" · "}
            <span className="uppercase text-zinc-300">{scan.wcagPreset}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link
            href={rescanHref}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
          >
            <RefreshCw className="size-4" aria-hidden />
            Re-scan
          </Link>
          <ShareLinkButton path={sharePath} />
        </div>
      </div>

      {issues.length === 0 ? (
        <Card className="agent-card">
          <CardHeader>
            <CardTitle className="text-base">No issues recorded</CardTitle>
            <CardDescription>
              This scan saved zero violations and zero needs-review items.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ScanFindingsReport
          scannedUrl={scan.url}
          issues={issues}
          wcagLabel={wcagLabel}
          needsReview={scan.reviewIssues.length}
          savedAt={scan.scannedAt}
        />
      )}
    </div>
  );
}
