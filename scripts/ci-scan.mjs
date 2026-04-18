#!/usr/bin/env node
/**
 * Fix 8 - GitHub Actions accessibility gate.
 *
 * Reads a list of URLs from one of (in order):
 *   1. The `A11Y_SCAN_URLS` env var (a JSON array of URL strings).
 *   2. `.a11y-urls.json` in the repo root (`{ "urls": [...] }`).
 *
 * For each URL it POSTs to `${A11Y_BASE_URL || "http://localhost:3000"}/api/scan`
 * (with the `X-A11y-CI-Token` header so the middleware's CI bypass admits
 * the request), aggregates results, writes a Markdown summary table to
 * `$GITHUB_STEP_SUMMARY`, and exits 1 only when at least one
 * `impact === "critical"` finding lands in any scan. SERIOUS / MODERATE /
 * MINOR violations are reported but never fail the build.
 *
 * No external dependencies - native `fetch` (Node >= 18) only.
 */

import { readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE_URL = (process.env.A11Y_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CI_TOKEN = process.env.A11Y_CI_TOKEN ?? "";
const SCAN_TIMEOUT_MS = Number(process.env.A11Y_SCAN_TIMEOUT_MS ?? 90_000);
const STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY ?? null;

const SEVERITY_ORDER = ["critical", "serious", "moderate", "minor"];

function log(msg) {
  process.stdout.write(`[ci-scan] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[ci-scan] ERROR: ${msg}\n`);
  process.exit(1);
}

async function loadUrls() {
  if (process.env.A11Y_SCAN_URLS) {
    try {
      const parsed = JSON.parse(process.env.A11Y_SCAN_URLS);
      if (!Array.isArray(parsed)) throw new Error("A11Y_SCAN_URLS must be a JSON array");
      return parsed.filter((u) => typeof u === "string" && u.trim().length > 0);
    } catch (e) {
      fail(`Could not parse A11Y_SCAN_URLS: ${e.message}`);
    }
  }
  const cfgPath = path.resolve(process.cwd(), ".a11y-urls.json");
  if (!existsSync(cfgPath)) {
    fail(`No URL source. Set A11Y_SCAN_URLS or create ${cfgPath}.`);
  }
  const raw = await readFile(cfgPath, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    fail(`Could not parse ${cfgPath}: ${e.message}`);
  }
  if (!json.urls || !Array.isArray(json.urls)) {
    fail(`${cfgPath} must contain { "urls": ["..."] }`);
  }
  return json.urls.filter((u) => typeof u === "string" && u.trim().length > 0);
}

/**
 * POST to `/api/scan` with the CI token header. Aborts after
 * `SCAN_TIMEOUT_MS`. Returns either `{ ok: true, payload }` or
 * `{ ok: false, error, status? }` so the caller can render a row in the
 * summary instead of crashing the whole batch on one bad URL.
 */
async function scanOne(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SCAN_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CI_TOKEN ? { "X-A11y-CI-Token": CI_TOKEN } : {}),
      },
      body: JSON.stringify({ url, wcagPreset: "wcag22-aa" }),
      signal: ac.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Server returned non-JSON (e.g. an HTML 5xx page).
    }
    if (!res.ok) {
      const errMsg = body?.error || `HTTP ${res.status}`;
      return { ok: false, error: errMsg, status: res.status };
    }
    if (!body || !Array.isArray(body.issues)) {
      return { ok: false, error: "scan response missing issues[]" };
    }
    return { ok: true, payload: body };
  } catch (e) {
    if (ac.signal.aborted) {
      return { ok: false, error: `timed out after ${Math.round(SCAN_TIMEOUT_MS / 1000)}s` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

function countByImpact(issues) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const issue of issues) {
    if (counts[issue.impact] !== undefined) counts[issue.impact] += 1;
  }
  return counts;
}

function renderSummaryTable(rows) {
  const header =
    "| URL | Critical | Serious | Moderate | Minor | Status |\n" +
    "| --- | ---: | ---: | ---: | ---: | --- |\n";
  const body = rows
    .map((r) => {
      if (r.error) {
        return `| \`${r.url}\` |  |  |  |  | ❗ ${r.error} |`;
      }
      const c = r.counts;
      const status = c.critical > 0 ? "❌ FAIL" : "✅ PASS";
      return `| \`${r.url}\` | ${c.critical} | ${c.serious} | ${c.moderate} | ${c.minor} | ${status} |`;
    })
    .join("\n");
  return header + body;
}

function renderTopRules(rows) {
  const tally = new Map();
  for (const r of rows) {
    if (r.error || !r.criticalIssues) continue;
    for (const issue of r.criticalIssues) {
      const key = issue.id;
      const entry = tally.get(key) ?? { id: key, description: issue.description, count: 0 };
      entry.count += 1;
      tally.set(key, entry);
    }
  }
  if (tally.size === 0) return "";
  const top = Array.from(tally.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((e) => `- **${e.id}** (${e.count}× critical) — ${e.description}`)
    .join("\n");
  return `\n\n#### Top critical rules\n${top}\n`;
}

async function writeSummary(markdown) {
  if (STEP_SUMMARY) {
    try {
      await appendFile(STEP_SUMMARY, markdown + "\n");
    } catch (e) {
      log(`could not write GITHUB_STEP_SUMMARY: ${e.message}`);
    }
  }
  process.stdout.write("\n" + markdown + "\n");
}

async function main() {
  const urls = await loadUrls();
  if (urls.length === 0) fail("URL list resolved to []");
  log(`scanning ${urls.length} URL(s) against ${BASE_URL}/api/scan`);
  if (!CI_TOKEN) {
    log(
      "WARN: A11Y_CI_TOKEN is unset; scans will only succeed if /api/scan is publicly reachable on this server.",
    );
  }

  const rows = [];
  for (const url of urls) {
    log(`-> ${url}`);
    const start = Date.now();
    const res = await scanOne(url);
    const ms = Date.now() - start;
    if (!res.ok) {
      log(`   ${url} :: error: ${res.error} (${ms}ms)`);
      rows.push({ url, error: res.error });
      continue;
    }
    const issues = res.payload.issues ?? [];
    const counts = countByImpact(issues);
    const criticalIssues = issues.filter((i) => i.impact === "critical");
    log(
      `   ${url} :: ${issues.length} issues (${SEVERITY_ORDER.map((k) => `${k[0]}=${counts[k]}`).join(" ")}) in ${ms}ms`,
    );
    rows.push({ url, counts, criticalIssues });
  }

  const totalCritical = rows.reduce((sum, r) => sum + (r.counts?.critical ?? 0), 0);
  const totalErrors = rows.filter((r) => r.error).length;
  const verdict =
    totalCritical > 0
      ? `❌ **FAIL** — ${totalCritical} critical violation(s) across ${rows.length} URL(s)`
      : totalErrors > 0
        ? `⚠️ **PASS with warnings** — ${totalErrors} URL(s) errored, no critical violations`
        : `✅ **PASS** — no critical violations across ${rows.length} URL(s)`;

  const markdown =
    `## A11yAgent CI scan\n\n${verdict}\n\n${renderSummaryTable(rows)}${renderTopRules(rows)}`;
  await writeSummary(markdown);

  if (totalCritical > 0) {
    log(`exiting 1: ${totalCritical} critical violation(s) found`);
    process.exit(1);
  }
  log("exiting 0: no critical violations");
  process.exit(0);
}

main().catch((err) => {
  fail(err instanceof Error ? err.stack ?? err.message : String(err));
});
