import PDFDocument from "pdfkit";
import type { DbScan, DbScanPage } from "@/lib/db";

const COLORS = {
  critical: "#dc2626",
  serious: "#ea580c",
  moderate: "#ca8a04",
  minor: "#2563eb",
  pass: "#16a34a",
  bg: "#0f172a",
  text: "#e2e8f0",
  muted: "#94a3b8",
  border: "#334155",
} as const;

function severityLabel(impact: string): string {
  const labels: Record<string, string> = {
    critical: "Critical",
    serious: "Serious",
    moderate: "Moderate",
    minor: "Minor",
  };
  return labels[impact] || impact;
}

interface ParsedViolation {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  nodes: { html: string; target: string[]; failureSummary: string }[];
}

function parsePageResults(resultsJson: string): {
  violations: ParsedViolation[];
  passCount: number;
} {
  try {
    const data = JSON.parse(resultsJson);
    const violations = (data.violations ?? []) as ParsedViolation[];
    const passCount = Array.isArray(data.passes) ? data.passes.length : 0;
    return { violations, passCount };
  } catch {
    return { violations: [], passCount: 0 };
  }
}

export function generatePdfReport(scan: DbScan, pages: DbScanPage[]): Buffer {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  // Cover page
  doc.rect(0, 0, doc.page.width, 180).fill(COLORS.bg);
  doc.fillColor("#10b981").fontSize(28).text("A11yAgent", 50, 50);
  doc.fillColor(COLORS.text).fontSize(12).text("Accessibility Scan Report", 50, 85);

  doc.fillColor(COLORS.text).fontSize(11);
  doc.text(`URL: ${scan.url}`, 50, 130);
  doc.text(`Date: ${scan.started_at}`, 50, 148);
  doc.text(`WCAG Level: ${scan.wcag_level}`, 50, 166);

  // Score
  const score = scan.overall_score ?? 0;
  const scoreColor = score >= 90 ? COLORS.pass : score >= 70 ? COLORS.moderate : COLORS.critical;
  doc.fillColor(scoreColor).fontSize(48).text(`${score}`, 400, 100, { width: 100, align: "center" });
  doc.fillColor(COLORS.muted).fontSize(10).text("Overall Score", 400, 155, { width: 100, align: "center" });

  // Summary stats
  doc.moveDown(3);
  doc.fillColor(COLORS.text).fontSize(16).text("Summary", 50);
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Pages Scanned: ${scan.pages_scanned}`);
  doc.text(`Total Violations: ${scan.total_violations}`);
  doc.text(`Total Passes: ${scan.total_passes}`);
  doc.text(`Incomplete Checks: ${scan.total_incomplete}`);

  // Severity breakdown
  const breakdown: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const p of pages) {
    if (!p.results_json) continue;
    const { violations } = parsePageResults(p.results_json);
    for (const v of violations) {
      const nodeCount = v.nodes?.length || 1;
      breakdown[v.impact] = (breakdown[v.impact] || 0) + nodeCount;
    }
  }

  doc.moveDown(1);
  doc.fillColor(COLORS.text).fontSize(14).text("Severity Breakdown");
  doc.moveDown(0.5);

  for (const [level, count] of Object.entries(breakdown)) {
    const total = scan.total_violations || 1;
    const barWidth = Math.max((count / total) * 300, 2);
    const y = doc.y;
    doc.rect(150, y, barWidth, 14).fill(COLORS[level as keyof typeof COLORS] || COLORS.moderate);
    doc.fillColor(COLORS.text).fontSize(10);
    doc.text(`${severityLabel(level)}`, 50, y + 2);
    doc.text(`${count}`, 460, y + 2);
    doc.y = y + 22;
  }

  // Per-page results
  for (const p of pages) {
    doc.addPage();
    doc.fillColor(COLORS.text).fontSize(16).text(p.title || p.url || "Unknown page", 50, 50);
    doc.fillColor(COLORS.muted).fontSize(9).text(p.url || "", 50, 72);
    doc.fillColor(COLORS.text).fontSize(11).text(`Score: ${p.score ?? "N/A"} | Violations: ${p.violations_count} | Passes: ${p.passes_count}`, 50, 90);

    if (!p.results_json) {
      doc.moveDown(1);
      doc.text("No detailed results available for this page.");
      continue;
    }

    const { violations } = parsePageResults(p.results_json);
    doc.moveDown(1);

    for (const v of violations.slice(0, 30)) {
      if (doc.y > 700) doc.addPage();

      const impactColor = COLORS[v.impact as keyof typeof COLORS] || COLORS.moderate;
      doc.rect(50, doc.y, 4, 14).fill(impactColor);
      doc.fillColor(COLORS.text).fontSize(10).text(
        `${severityLabel(v.impact)} — ${v.id}`,
        60, doc.y - 14,
      );
      doc.fillColor(COLORS.muted).fontSize(9);
      doc.text(v.description, 60, doc.y + 2, { width: 480 });

      for (const node of (v.nodes || []).slice(0, 3)) {
        if (doc.y > 720) doc.addPage();
        doc.fillColor(COLORS.muted).fontSize(8);
        const snippet = (node.html || "").slice(0, 200);
        if (snippet) doc.text(`  Element: ${snippet}`, 60, doc.y + 2, { width: 470 });
      }
      doc.moveDown(0.8);
    }
  }

  // Footer
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fillColor(COLORS.muted).fontSize(8);
    doc.text(`A11yAgent Report — Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 30, {
      width: doc.page.width - 100,
      align: "center",
    });
  }

  doc.end();
  return Buffer.concat(chunks);
}

export function generateCsvReport(scan: DbScan, pages: DbScanPage[]): string {
  const rows: Record<string, string>[] = [];

  for (const p of pages) {
    if (!p.results_json) continue;
    const { violations } = parsePageResults(p.results_json);

    for (const v of violations) {
      for (const node of (v.nodes || [{ html: "", target: [], failureSummary: "" }]).slice(0, 50)) {
        rows.push({
          "Page URL": p.url || "",
          "Page Title": p.title || "",
          "Page Score": String(p.score ?? ""),
          "Rule ID": v.id,
          Severity: severityLabel(v.impact),
          Impact: v.impact,
          Description: v.description,
          Element: (node.html || "").slice(0, 500),
          Selector: (node.target || []).join(", "),
          Fix: node.failureSummary || "",
          "Help URL": v.helpUrl || "",
        });
      }
    }
  }

  if (rows.length === 0) {
    return "Message\nNo violations found — all checks passed!";
  }

  const { Parser } = require("json2csv") as typeof import("json2csv");
  const parser = new Parser({
    fields: [
      "Page URL", "Page Title", "Page Score", "Rule ID", "Severity",
      "Impact", "Description", "Element", "Selector", "Fix", "Help URL",
    ],
  });
  return parser.parse(rows);
}
