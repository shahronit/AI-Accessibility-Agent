import { auth } from "@/auth";
import { getScanById } from "@/lib/db";
import { getScanProgress } from "../../route";

export const runtime = "nodejs";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const scan = getScanById(id);
  if (!scan || scan.user_id !== session.user.id) {
    return new Response(JSON.stringify({ error: "Scan not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

      // If scan is already done, send one event and close
      if (terminalStatuses.has(scan.status)) {
        send({
          phase: scan.status,
          message: scan.status === "completed" ? "Scan complete" : scan.error_message || scan.status,
          pagesScanned: scan.pages_scanned,
          pagesTotal: scan.pages_total,
          score: scan.overall_score,
        });
        controller.close();
        return;
      }

      // Poll for progress updates
      for (let i = 0; i < 300; i++) {
        const progress = getScanProgress(id);
        const current = getScanById(id);

        if (progress) {
          send(progress);
        } else if (current) {
          send({
            phase: current.status,
            message: current.status,
            pagesScanned: current.pages_scanned,
            pagesTotal: current.pages_total,
            score: current.overall_score,
          });
        }

        if (current && terminalStatuses.has(current.status)) {
          controller.close();
          return;
        }

        await delay(1000);
      }

      send({ phase: "timeout", message: "Progress stream timed out" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
