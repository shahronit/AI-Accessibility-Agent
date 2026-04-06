"use client";

import { jsPDF } from "jspdf";
import type { ChatMessage } from "@/lib/aiClient";
import type { ImpactLevel, ScanIssue } from "@/lib/axeScanner";

export type IssueExportFilter = "all" | ImpactLevel;

export function filterIssuesByTab(issues: ScanIssue[], filter: IssueExportFilter): ScanIssue[] {
  if (filter === "all") return [...issues];
  return issues.filter((i) => i.impact === filter);
}

function filterLabel(filter: IssueExportFilter): string {
  if (filter === "all") return "All issues";
  return `${filter.charAt(0).toUpperCase()}${filter.slice(1)} only`;
}

function csvEscape(value: string): string {
  const s = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Issues PDF: one section per finding with spacing and a filter note on the cover.
 */
export function exportIssuesPdf(scannedUrl: string, issues: ScanIssue[], filter: IssueExportFilter) {
  const list = filterIssuesByTab(issues, filter);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = margin;
  const lineHeight = 13;
  const sectionGap = 18;
  const pageHeight = doc.internal.pageSize.getHeight();

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addRawLine = (text: string, opts?: { bold?: boolean; color?: [number, number, number] }) => {
    ensureSpace(lineHeight * 2);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    if (opts?.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
    else doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
  };

  doc.setFontSize(18);
  addRawLine("Accessibility scan report", { bold: true });
  doc.setFontSize(11);
  addRawLine(`URL: ${scannedUrl}`);
  addRawLine(`Filter: ${filterLabel(filter)} (${list.length} issue${list.length === 1 ? "" : "s"})`);
  addRawLine(`Generated: ${new Date().toISOString()}`);
  y += sectionGap;

  const maxIssues = 100;
  const slice = list.slice(0, maxIssues);

  slice.forEach((issue, idx) => {
    ensureSpace(80);
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += sectionGap / 2;

    doc.setFontSize(13);
    addRawLine(`Issue ${issue.index}  •  ${issue.impact.toUpperCase()}  •  ${issue.id}`, { bold: true });
    doc.setFontSize(10);
    addRawLine("Description", { bold: true });
    addRawLine(issue.description);
    y += 6;
    addRawLine("Help / WCAG reference", { bold: true });
    addRawLine(issue.helpUrl);
    y += 6;
    if (issue.failureSummary) {
      addRawLine("Failure summary", { bold: true });
      addRawLine(issue.failureSummary.slice(0, 2000));
      y += 6;
    }
    addRawLine("Affected HTML (snippet)", { bold: true });
    const htmlSnip = issue.html.slice(0, 1200);
    addRawLine(htmlSnip + (issue.html.length > 1200 ? "…" : ""));
    if (issue.targets?.length) {
      y += 6;
      addRawLine("Selectors / targets", { bold: true });
      addRawLine(
        issue.targets
          .slice(0, 15)
          .map((t) => String(t))
          .join("\n")
          .slice(0, 2000),
      );
    }
    y += sectionGap;
    if (idx < slice.length - 1) doc.setTextColor(0, 0, 0);
  });

  if (list.length > maxIssues) {
    addRawLine(`… ${list.length - maxIssues} additional issues not included. Narrow the filter or export CSV for the full list.`);
  }

  const slug = `${filter}-${encodeURIComponent(scannedUrl).slice(0, 28)}`;
  doc.save(`a11y-issues-${slug}.pdf`);
}

export function exportIssuesCsv(scannedUrl: string, issues: ScanIssue[], filter: IssueExportFilter) {
  const list = filterIssuesByTab(issues, filter);
  const headers = [
    "Index",
    "RuleId",
    "Impact",
    "Description",
    "HelpUrl",
    "HtmlSnippet",
    "FailureSummary",
    "Targets",
  ];
  const rows = list.map((issue) => [
    String(issue.index),
    issue.id,
    issue.impact,
    issue.description,
    issue.helpUrl,
    issue.html.slice(0, 8000),
    issue.failureSummary ?? "",
    (issue.targets ?? []).map((t) => String(t)).join(" | "),
  ]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => csvEscape(c)).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `a11y-issues-${filter}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function addColoredBodyLines(
  doc: jsPDF,
  body: string,
  margin: number,
  maxW: number,
  lineHeight: number,
  pageHeight: number,
  yRef: { y: number },
) {
  const addLine = (text: string, rgb?: [number, number, number]) => {
    if (yRef.y > pageHeight - 52) {
      doc.addPage();
      yRef.y = margin;
    }
    doc.setFont("helvetica", "normal");
    if (rgb) doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    else doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    for (const line of lines) {
      if (yRef.y > pageHeight - 52) {
        doc.addPage();
        yRef.y = margin;
      }
      doc.text(line, margin, yRef.y);
      yRef.y += lineHeight;
    }
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.length > 2000 ? rawLine.slice(0, 2000) + "…" : rawLine;
    const t = line.trim();
    if (t.startsWith("✅") || /^\[ADD\]/i.test(t) || /^ADD\s*\(/i.test(t)) {
      addLine(line, [0, 110, 40]);
    } else if (t.startsWith("❌") || /^\[REMOVE\]/i.test(t) || /^REMOVE\s*\(/i.test(t)) {
      addLine(line, [190, 30, 30]);
    } else {
      addLine(line);
    }
  }
}

export function exportExplanationPdf(params: {
  scannedUrl: string | null;
  issue: ScanIssue | null;
  explanation: string;
}) {
  const { scannedUrl, issue, explanation } = params;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const maxW = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  const yRef = { y: margin };
  const lineHeight = 12;

  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("AI accessibility explanation", margin, yRef.y);
  yRef.y += 22;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (scannedUrl) {
    doc.text(`Scan URL: ${scannedUrl}`, margin, yRef.y);
    yRef.y += lineHeight + 4;
  }
  if (issue) {
    doc.setFont("helvetica", "bold");
    doc.text(`Issue ${issue.index} • ${issue.impact} • ${issue.id}`, margin, yRef.y);
    yRef.y += lineHeight + 8;
    doc.setFont("helvetica", "normal");
  }
  doc.text(`Generated: ${new Date().toISOString()}`, margin, yRef.y);
  yRef.y += lineHeight + 12;

  addColoredBodyLines(doc, explanation, margin, maxW, lineHeight, pageHeight, yRef);

  doc.save(`a11y-ai-explanation-${issue?.index ?? "issue"}.pdf`);
}

export function exportChatPdf(params: {
  scannedUrl: string | null;
  messages: ChatMessage[];
  issueLabel?: string | null;
}) {
  const { scannedUrl, messages, issueLabel } = params;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const maxW = doc.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();
  const yRef = { y: margin };
  const lineHeight = 12;

  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.text("AI chat transcript", margin, yRef.y);
  yRef.y += 22;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (scannedUrl) {
    doc.text(`Context URL: ${scannedUrl}`, margin, yRef.y);
    yRef.y += lineHeight + 2;
  }
  if (issueLabel) {
    doc.text(`Focused issue: ${issueLabel}`, margin, yRef.y);
    yRef.y += lineHeight + 2;
  }
  doc.text(`Generated: ${new Date().toISOString()}`, margin, yRef.y);
  yRef.y += lineHeight + 14;

  for (const m of messages) {
    const prefix = m.role === "user" ? "You" : "Assistant";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    if (yRef.y > pageHeight - 52) {
      doc.addPage();
      yRef.y = margin;
    }
    doc.text(`${prefix}:`, margin, yRef.y);
    yRef.y += lineHeight;
    doc.setFont("helvetica", "normal");
    addColoredBodyLines(doc, m.content, margin, maxW, lineHeight, pageHeight, yRef);
    yRef.y += 8;
  }

  doc.save(`a11y-ai-chat-${Date.now()}.pdf`);
}
