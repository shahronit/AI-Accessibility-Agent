import type { ScanIssue } from "@/lib/axeScanner";

export function pagePathFromScannedUrl(scannedUrl: string): string {
  try {
    const u = new URL(scannedUrl);
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

/** One-line title for Jira / bug trackers (matches common accessibility ticket patterns). */
export function jiraBugReportTitle(issue: ScanIssue, scannedUrl: string): string {
  const path = pagePathFromScannedUrl(scannedUrl);
  const sev = issue.impact.toUpperCase();
  const line = issue.description.replace(/\s+/g, " ").trim();
  const prefix = issue.kind === "needs_review" ? "[Needs review] " : "";
  return `${prefix}[Accessibility] [${sev}] ${line} — ${path}`;
}

export function allJiraBugTitles(issues: ScanIssue[], scannedUrl: string): string {
  return issues.map((i) => jiraBugReportTitle(i, scannedUrl)).join("\n\n");
}
