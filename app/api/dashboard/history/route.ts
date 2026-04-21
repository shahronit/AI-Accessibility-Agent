import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/currentUser";
import { getUserScans, getUserScanCount, clearUserHistory } from "@/lib/db";

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();

  const { searchParams } = new URL(req.url);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const [scans, total] = await Promise.all([
    getUserScans(userId, limit, offset),
    getUserScanCount(userId),
  ]);

  return NextResponse.json({
    scans,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  await clearUserHistory(userId);
  return NextResponse.json({ message: "History cleared" });
}
