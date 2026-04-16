import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getScanById, getScanPages, updateScan } from "@/lib/db";
import { requestCancelScan } from "../route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const scan = getScanById(id);
  if (!scan || scan.user_id !== user.id) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const pages = getScanPages(id);

  return NextResponse.json({ scan, pages });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const scan = getScanById(id);
  if (!scan || scan.user_id !== user.id) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const cancellable = new Set(["pending", "crawling", "scanning"]);
  if (!cancellable.has(scan.status)) {
    return NextResponse.json({ error: "Scan cannot be cancelled in its current state" }, { status: 400 });
  }

  requestCancelScan(id);
  updateScan(id, { status: "cancelled" });

  return NextResponse.json({ message: "Scan cancelled" });
}
