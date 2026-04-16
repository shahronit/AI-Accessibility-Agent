import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScanById, getScanPages } from "@/lib/db";

interface ViolationSummary {
  ruleId: string;
  count: number;
  impact: string;
}

function extractViolationRules(pages: { results_json: string | null }[]): ViolationSummary[] {
  const map = new Map<string, { count: number; impact: string }>();
  for (const p of pages) {
    if (!p.results_json) continue;
    try {
      const data = JSON.parse(p.results_json);
      for (const v of data.violations ?? []) {
        const existing = map.get(v.id);
        const nodeCount = v.nodes?.length || 1;
        if (existing) {
          existing.count += nodeCount;
        } else {
          map.set(v.id, { count: nodeCount, impact: v.impact || "moderate" });
        }
      }
    } catch {
      /* skip */
    }
  }
  return Array.from(map.entries()).map(([ruleId, { count, impact }]) => ({
    ruleId,
    count,
    impact,
  }));
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scanAId = searchParams.get("scanA");
  const scanBId = searchParams.get("scanB");

  if (!scanAId || !scanBId) {
    return NextResponse.json({ error: "Both scanA and scanB query params required" }, { status: 400 });
  }

  const scanA = getScanById(scanAId);
  const scanB = getScanById(scanBId);

  if (!scanA || scanA.user_id !== user.id) {
    return NextResponse.json({ error: "Scan A not found" }, { status: 404 });
  }
  if (!scanB || scanB.user_id !== user.id) {
    return NextResponse.json({ error: "Scan B not found" }, { status: 404 });
  }

  const pagesA = getScanPages(scanAId);
  const pagesB = getScanPages(scanBId);
  const rulesA = extractViolationRules(pagesA);
  const rulesB = extractViolationRules(pagesB);

  const ruleSetA = new Set(rulesA.map((r) => r.ruleId));
  const ruleSetB = new Set(rulesB.map((r) => r.ruleId));

  const fixed = rulesA.filter((r) => !ruleSetB.has(r.ruleId));
  const introduced = rulesB.filter((r) => !ruleSetA.has(r.ruleId));
  const unchanged = rulesA.filter((r) => ruleSetB.has(r.ruleId));

  const scoreA = scanA.overall_score ?? 0;
  const scoreB = scanB.overall_score ?? 0;

  return NextResponse.json({
    scanA: {
      id: scanA.id,
      url: scanA.url,
      score: scoreA,
      violations: scanA.total_violations,
      passes: scanA.total_passes,
      pagesScanned: scanA.pages_scanned,
      date: scanA.started_at,
    },
    scanB: {
      id: scanB.id,
      url: scanB.url,
      score: scoreB,
      violations: scanB.total_violations,
      passes: scanB.total_passes,
      pagesScanned: scanB.pages_scanned,
      date: scanB.started_at,
    },
    comparison: {
      scoreDiff: Math.round((scoreB - scoreA) * 10) / 10,
      violationsDiff: scanB.total_violations - scanA.total_violations,
      passesDiff: scanB.total_passes - scanA.total_passes,
      improved: scoreB > scoreA,
      fixed,
      introduced,
      unchanged: unchanged.length,
    },
  });
}
