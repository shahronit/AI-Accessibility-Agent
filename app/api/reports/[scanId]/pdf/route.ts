import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getScanById, getScanPages } from "@/lib/db";
import { generatePdfReport } from "@/lib/serverReporter";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  let user;
  try {
    user = requireAuth(req);
  } catch {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const scan = getScanById(scanId);
  if (!scan || scan.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Scan not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (scan.status !== "completed") {
    return new Response(JSON.stringify({ error: "Scan is not completed yet" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pages = getScanPages(scanId);
  const pdf = generatePdfReport(scan, pages);

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="a11y-report-${scanId.slice(0, 8)}.pdf"`,
    },
  });
}
