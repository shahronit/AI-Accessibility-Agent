import { auth } from "@/auth";
import { getScanById, getScanPages } from "@/lib/db";
import { generateCsvReport } from "@/lib/serverReporter";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const scan = getScanById(scanId);
  if (!scan || scan.user_id !== session.user.id) {
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
