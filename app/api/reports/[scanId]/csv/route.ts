import { getCurrentUserId } from "@/lib/currentUser";
import { getScanById, getScanPages } from "@/lib/db";
import { generateCsvReport } from "@/lib/serverReporter";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  const userId = await getCurrentUserId();

  const scan = getScanById(scanId);
  if (!scan || scan.user_id !== userId) {
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
  const csv = generateCsvReport(scan, pages);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="a11y-report-${scanId.slice(0, 8)}.csv"`,
    },
  });
}
