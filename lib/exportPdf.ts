"use client";

import { jsPDF } from "jspdf";
import type { ScanIssue } from "@/lib/axeScanner";

/**
 * Export a simple text report suitable for sharing or archival.
 */
export function exportScanPdf(scannedUrl: string, issues: ScanIssue[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  let y = margin;
  const lineHeight = 14;
  const pageHeight = doc.internal.pageSize.getHeight();

  const addLine = (text: string, bold = false) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - margin * 2);
    for (const line of lines as string[]) {
      doc.text(line, margin, y);
      y += lineHeight;
    }
  };

  doc.setFontSize(16);
  addLine("Accessibility scan report", true);
  doc.setFontSize(10);
  addLine(`URL: ${scannedUrl}`);
  addLine(`Generated: ${new Date().toISOString()}`);
  addLine(`Total findings: ${issues.length}`);
  y += lineHeight;

  issues.slice(0, 80).forEach((issue) => {
    addLine(`${issue.index}. [${issue.impact.toUpperCase()}] ${issue.id}`, true);
    addLine(issue.description);
    if (issue.html) addLine(`HTML: ${issue.html.slice(0, 400)}${issue.html.length > 400 ? "…" : ""}`);
    addLine(`Help: ${issue.helpUrl}`);
    y += lineHeight / 2;
  });

  if (issues.length > 80) {
    addLine(`… ${issues.length - 80} additional issues not shown in this PDF.`);
  }

  doc.save(`a11y-report-${encodeURIComponent(scannedUrl).slice(0, 40)}.pdf`);
}
