import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDashboardStats, getSeverityBreakdown } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = session.user.id;
  const stats = getDashboardStats(userId);
  const severity = getSeverityBreakdown(userId);

  return NextResponse.json({ ...stats, severity });
}
