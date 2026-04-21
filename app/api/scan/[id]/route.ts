import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/currentUser";
import { getScanById, getScanPages, updateScan } from "@/lib/db";
import { requestCancelScan } from "../route";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const scan = await getScanById(id);
  if (!scan || scan.user_id !== userId) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const pages = await getScanPages(id);

  return NextResponse.json({ scan, pages });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const scan = await getScanById(id);
  if (!scan || scan.user_id !== userId) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const cancellable = new Set(["pending", "crawling", "scanning"]);
  if (!cancellable.has(scan.status)) {
    return NextResponse.json({ error: "Scan cannot be cancelled in its current state" }, { status: 400 });
  }

  requestCancelScan(id);
  await updateScan(id, { status: "cancelled" });

  return NextResponse.json({ message: "Scan cancelled" });
}
