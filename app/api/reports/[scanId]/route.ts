import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getScanById, getScanPages, getSeverityBreakdown } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const userId = session.user.id;

  const scan = getScanById(scanId);
  if (!scan || scan.user_id !== userId) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const pages = getScanPages(scanId).map((p) => {
    let results = null;
    if (p.results_json) {
      try {
        results = JSON.parse(p.results_json);
      } catch {
        results = null;
      }
    }
    return { ...p, results, results_json: undefined };
  });

  const severity = getSeverityBreakdown(userId);

  const summary = {
    totalViolations: scan.total_violations,
    totalPasses: scan.total_passes,
    totalIncomplete: scan.total_incomplete,
    overallScore: scan.overall_score,
    pagesScanned: scan.pages_scanned,
    severity,
  };

  return NextResponse.json({
    scan: {
      id: scan.id,
      url: scan.url,
      status: scan.status,
      wcag_level: scan.wcag_level,
      max_pages: scan.max_pages,
      overall_score: scan.overall_score,
      total_violations: scan.total_violations,
      total_passes: scan.total_passes,
      total_incomplete: scan.total_incomplete,
      pages_scanned: scan.pages_scanned,
      started_at: scan.started_at,
      completed_at: scan.completed_at,
    },
    pages,
    summary,
  });
}
