import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserScans, getUserScanCount, clearUserHistory } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const scans = getUserScans(userId, limit, offset);
  const total = getUserScanCount(userId);

  return NextResponse.json({
    scans,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  clearUserHistory(session.user.id);
  return NextResponse.json({ message: "History cleared" });
}
