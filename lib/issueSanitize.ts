import type { ScanIssue } from "@/lib/axeScanner";

/** JSON-safe issue payload for API routes (server + client). */
export function sanitizeIssueForApi(issue: ScanIssue): ScanIssue {
  return {
    index: issue.index,
    id: issue.id,
    description: issue.description,
    impact: issue.impact,
    html: issue.html.slice(0, 16_000),
    helpUrl: issue.helpUrl,
    failureSummary: issue.failureSummary?.slice(0, 4000),
    targets: issue.targets,
  };
}
