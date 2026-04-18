"use client";

import pLimit from "p-limit";
import type { ScanIssue, ImpactLevel } from "@/lib/axeScanner";
import { postAppJson, sanitizeIssueForApi } from "@/lib/clientApi";

/**
 * Fix 6 - Parallel AI explanations.
 *
 * `explainAllIssues` pre-fetches AI explanations for a batch of scan issues
 * with bounded concurrency, so the scan results UI can warm the explain
 * cache while the user is still skimming the list.
 *
 * Design notes:
 *  - Concurrency is capped at 3 (per the brief) to respect Anthropic and
 *    Gemini rate-limit envelopes when many issues land in one scan.
 *  - We use `Promise.allSettled` so a single 429 / network blip does not
 *    poison the whole batch - failed entries are reported via `onResult`
 *    with `error` populated and otherwise omitted from the returned map.
 *  - `AbortSignal` lets the caller cancel in-flight requests when the user
 *    starts a new scan or navigates away.
 */

export type ExplainAllOptions = {
  /** Max concurrent /api/ai-explain calls. Defaults to 3. */
  concurrency?: number;
  /**
   * Per-request timeout passed through to `postAppJson`. Defaults to 90 s
   * because the AI fallback chain (Anthropic -> Gemini -> AssemblyAI) can
   * take longer than the typical 30 s when the primary is rate-limited.
   */
  timeoutMs?: number;
  /**
   * Caller can abort the whole batch (e.g. a new scan started). The signal
   * is checked between scheduling each request and short-circuits any
   * not-yet-started entries.
   */
  signal?: AbortSignal;
  /**
   * Progress callback fired whenever an individual entry finishes (success
   * or failure). `done` is the count of completed entries (1-based);
   * `total` is the input length. The UI uses this to render
   * "Explaining 3/10 issues...".
   */
  onResult?: (event: ExplainAllProgress) => void;
};

export type ExplainAllProgress = {
  done: number;
  total: number;
  issue: ScanIssue;
  /** Resolved markdown explanation, or null if the call failed. */
  explanation: string | null;
  /** Provider model id when available (e.g. "claude-sonnet-4-5"). */
  model: string | null;
  /** Error message when `explanation` is null. */
  error?: string;
};

export type ExplainAllResult = {
  /** Map keyed by `issueExplainKey(issue)` -> explanation text. */
  explanations: Map<string, string>;
  /** Per-issue model id, parallel to `explanations`. */
  models: Map<string, string>;
  /** Issues whose explanation request failed. */
  failures: Array<{ issue: ScanIssue; error: string }>;
};

/**
 * Stable key for storing explanations per-issue. We prefer the merged
 * `wcagCriterion` (Fix 5) when available, then the rule id, plus a short
 * snippet hash so two distinct nodes flagged by the same rule still get
 * their own explanation.
 */
export function issueExplainKey(issue: ScanIssue): string {
  const canonical = issue.wcagCriterion ?? issue.id;
  const html = (issue.html ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${canonical}::${html || `idx${issue.index}`}`;
}

const SEVERITY_ORDER: ImpactLevel[] = ["critical", "serious", "moderate", "minor"];

/**
 * Pick the top N issues by impact, using the same ordering the UI sorts by
 * (critical -> serious -> moderate -> minor) so the first 10 explanations
 * the user sees on screen are the first ones we pre-warm.
 */
export function pickTopIssues(issues: ScanIssue[], n: number): ScanIssue[] {
  return [...issues]
    .sort((a, b) => {
      const ia = SEVERITY_ORDER.indexOf(a.impact);
      const ib = SEVERITY_ORDER.indexOf(b.impact);
      if (ia !== ib) return ia - ib;
      return a.index - b.index;
    })
    .slice(0, n);
}

export async function explainAllIssues(
  issues: ScanIssue[],
  opts: ExplainAllOptions = {},
): Promise<ExplainAllResult> {
  const { concurrency = 3, timeoutMs = 90_000, signal, onResult } = opts;
  const limit = pLimit(Math.max(1, concurrency));
  const total = issues.length;
  const explanations = new Map<string, string>();
  const models = new Map<string, string>();
  const failures: Array<{ issue: ScanIssue; error: string }> = [];

  let done = 0;

  const tasks = issues.map((issue) =>
    limit(async () => {
      // Honour caller cancellation before kicking off a new request. Already
      // in-flight requests rely on `postAppJson`'s internal AbortController
      // for their own timeout; a more aggressive abort would require the
      // helper to accept an external signal (left for a follow-up).
      if (signal?.aborted) {
        const err = "aborted";
        failures.push({ issue, error: err });
        done += 1;
        onResult?.({ done, total, issue, explanation: null, model: null, error: err });
        return;
      }

      try {
        const data = await postAppJson<{ explanation?: string; model?: string }>(
          "/api/ai-explain",
          { issue: sanitizeIssueForApi(issue) },
          { timeoutMs },
        );
        const text = typeof data.explanation === "string" ? data.explanation : "";
        const model = typeof data.model === "string" ? data.model : null;
        const key = issueExplainKey(issue);
        if (text) {
          explanations.set(key, text);
          if (model) models.set(key, model);
        } else {
          failures.push({ issue, error: "Empty explanation returned" });
        }
        done += 1;
        onResult?.({ done, total, issue, explanation: text || null, model, error: text ? undefined : "Empty explanation returned" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Explanation failed";
        failures.push({ issue, error: message });
        done += 1;
        onResult?.({ done, total, issue, explanation: null, model: null, error: message });
      }
    }),
  );

  // `Promise.allSettled` is belt-and-braces: each `limit()` task already
  // catches its own errors and pushes to `failures`, but settled keeps the
  // signature `Promise<ExplainAllResult>` even if a task implementation
  // changes later and throws synchronously.
  await Promise.allSettled(tasks);

  return { explanations, models, failures };
}
