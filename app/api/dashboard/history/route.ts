import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserScans, getUserScanCount, clearUserHistory } from "@/lib/db";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const scans = getUserScans(user.id, limit, offset);
  const total = getUserScanCount(user.id);

  return NextResponse.json({
    scans,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = requireAuth(req);
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  clearUserHistory(user.id);
  return NextResponse.json({ message: "History cleared" });
}
