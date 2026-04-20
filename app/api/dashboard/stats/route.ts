import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/currentUser";
import { getDashboardStats, getSeverityBreakdown } from "@/lib/db";

export async function GET() {
  const userId = await getCurrentUserId();
  const stats = getDashboardStats(userId);
  const severity = getSeverityBreakdown(userId);

  return NextResponse.json({ ...stats, severity });
}
