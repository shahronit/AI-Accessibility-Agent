import type { Page } from "puppeteer-core";
import type { ScanIssue, ImpactLevel } from "@/lib/axeScanner";

/**
 * Thin wrapper around IBM Equal Access (`accessibility-checker`) that runs
 * inside the same Puppeteer page our axe-core scan already controls.
 *
 * Why this design:
 * - Lazy `require()` of the IBM module: the package pulls in chromedriver +
 *   the standard `puppeteer` (not `puppeteer-core`), and we don't want either
 *   in our cold-start bundle when IBM is disabled. Importing on demand keeps
 *   `next build` fast and lets us env-gate the feature cleanly.
 * - `Promise.allSettled`-style swallowing: per the brief, IBM failures must
 *   never break the scan. Every error path returns `{ issues: [], ms, error }`
 *   so the caller can fold into the response unconditionally.
 * - Source mapping is conservative: IBM reports use a `[policy, confidence]`
 *   tuple plus a string `level`. We map to our four-rung impact scale below.
 *
 * Set `IBM_CHECKER_ENABLED=false` to skip IBM entirely (e.g. in environments
 * where chromedriver is unavailable or scan latency must stay low).
 */

export type IbmRunResult = {
  /** Normalised issues, source already set to "ibm". */
  issues: ScanIssue[];
  /** Wall time of the IBM run in milliseconds. */
  ms: number;
  /** Set when IBM was skipped or threw. Drives `meta.engines.ibm.error`. */
  error?: string;
  /** True when IBM actually executed (vs. env-gated off or crashed early). */
  ran: boolean;
};

type IbmIssue = {
  ruleId: string;
  path?: { [ns: string]: string };
  value?: [string, string];
  level?: string;
  message?: string;
  snippet?: string;
  category?: string;
  help?: string;
};

type IbmReport = {
  results?: IbmIssue[];
};

type IbmCheckerResult = {
  report?: IbmReport | { details?: unknown };
};

function ibmEnabled(): boolean {
  const v = process.env.IBM_CHECKER_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

/**
 * Map IBM's (policy, confidence) tuple + textual level into our four-rung
 * ImpactLevel. Rationale:
 *   - VIOLATION/FAIL is the highest-confidence WCAG breakage IBM emits;
 *     match axe's "serious" so it sorts above moderate findings.
 *   - VIOLATION/POTENTIAL still matters (page state-dependent), so keep it
 *     visible at "moderate".
 *   - RECOMMENDATION/* and INFORMATION/* surface as "minor" because they
 *     are advisories, not WCAG failures.
 */
function mapIbmImpact(issue: IbmIssue): ImpactLevel {
  const policy = issue.value?.[0]?.toUpperCase();
  const confidence = issue.value?.[1]?.toUpperCase();
  const level = issue.level?.toLowerCase();

  if (policy === "VIOLATION" && confidence === "FAIL") return "serious";
  if (policy === "VIOLATION" && confidence === "POTENTIAL") return "moderate";
  if (policy === "RECOMMENDATION" && confidence === "FAIL") return "moderate";

  if (level === "violation") return "serious";
  if (level === "potentialviolation") return "moderate";
  if (level === "recommendation" || level === "potentialrecommendation") return "minor";

  return "moderate";
}

/**
 * IBM rule ids generally do not embed the WCAG criterion. Some rule ids
 * mention the criterion (e.g. "WCAG21_Label_RefValid"); fall back to looking
 * for that pattern. Returning `undefined` is fine — the merge step uses the
 * rule id as the dedup key when the criterion is missing.
 */
function inferWcagCriterion(ruleId: string): string | undefined {
  const m = ruleId.match(/WCAG\d{0,2}_?(\d)[._]?(\d)[._]?(\d{1,2})/i);
  if (!m) return undefined;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function truncate(s: string, max = 2000): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function normaliseIbmReport(report: IbmReport): ScanIssue[] {
  const raw = Array.isArray(report.results) ? report.results : [];
  const issues: ScanIssue[] = [];
  let index = 1;

  for (const r of raw) {
    // IBM emits PASS rows for every check it ran; we only want failures.
    const policy = r.value?.[0]?.toUpperCase();
    const confidence = r.value?.[1]?.toUpperCase();
    if (policy === "INFORMATION" && confidence !== "FAIL") continue;
    if (confidence === "PASS") continue;

    const xpath = r.path?.dom ?? r.path?.aria ?? "";
    const issue: ScanIssue = {
      index: index++,
      id: r.ruleId,
      description: r.message ?? r.ruleId,
      impact: mapIbmImpact(r),
      html: truncate(r.snippet ?? ""),
      helpUrl:
        typeof r.help === "string" && r.help.length > 0
          ? r.help
          : `https://able.ibm.com/rules/archives/preview/doc/${encodeURIComponent(r.ruleId)}`,
      failureSummary: r.message ?? "",
      targets: xpath ? [xpath] : undefined,
      source: "ibm",
      wcagCriterion: inferWcagCriterion(r.ruleId),
    };
    issues.push(issue);
  }

  return issues;
}

export async function runIbmChecker(
  page: Page,
  scanLabel: string,
): Promise<IbmRunResult> {
  const start = Date.now();

  if (!ibmEnabled()) {
    return { issues: [], ms: 0, ran: false, error: "IBM_CHECKER_ENABLED=false" };
  }

  let aChecker: typeof import("accessibility-checker");
  try {
    // Lazy require so the heavy chromedriver + puppeteer deps stay out of
    // the cold-start bundle when IBM is disabled.
    aChecker = await import("accessibility-checker");
  } catch (e) {
    return {
      issues: [],
      ms: Date.now() - start,
      ran: false,
      error: `accessibility-checker unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  try {
    const result = (await aChecker.getCompliance(
      page as unknown as object,
      scanLabel,
    )) as IbmCheckerResult;

    const report = result?.report as IbmReport | undefined;
    if (!report || !Array.isArray(report.results)) {
      return {
        issues: [],
        ms: Date.now() - start,
        ran: true,
        error: "IBM checker returned no results array",
      };
    }

    const issues = normaliseIbmReport(report);
    return { issues, ms: Date.now() - start, ran: true };
  } catch (e) {
    return {
      issues: [],
      ms: Date.now() - start,
      ran: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
