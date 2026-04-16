import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDashboardStats, getSeverityBreakdown } from "@/lib/db";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const stats = getDashboardStats(user.id);
  const severity = getSeverityBreakdown(user.id);

  return NextResponse.json({ ...stats, severity });
}
