import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { getPuppeteerLaunchConfig } from "@/lib/browserLaunch";
import { summarizeChromeAxTree } from "@/lib/chromeAxTreeSummary";
import { SCAN_ENGINE_INFO } from "@/lib/scanEnginesMeta";
import { parseAndValidateScanCookies } from "@/lib/scanCookies";
import { assertSafeUrl, SsrfError } from "@/lib/ssrf-guard";
import { mergeFindings, normalizeAxeViolations, summarizeIssues } from "@/lib/axeScanner";
import { axeTagsForPreset, parseWcagPreset, type WcagPresetId } from "@/lib/wcagAxeTags";
import { auth } from "@/auth";
import { createScan, updateScan, createScanPage, calculateScore } from "@/lib/db";
import { discoverPages } from "@/lib/crawler";
import { enforceRateLimit, scanLimiter } from "@/lib/rateLimit";
import { runIbmChecker } from "@/lib/ibmChecker";
import {
  getCachedScan,
  saveScan,
  setCachedScan,
  type StoredScanResult,
} from "@/lib/scan-store";
import { ScanRequestSchema } from "@/lib/schemas";
import { validateRequest } from "@/lib/validate-request";

export const maxDuration = 60;
export const runtime = "nodejs";

/** Cap needs-review rows returned (can be large on noisy pages). */
const MAX_REVIEW_INSTANCES = 250;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchBrowser() {
  const { executablePath, args, headless } = await getPuppeteerLaunchConfig();
  return puppeteer.launch({
    args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless,
  });
}

// In-memory progress for SSE streaming of multi-page scans
const scanProgress = new Map<string, { phase: string; message: string; pagesScanned: number; pagesTotal: number; score: number | null }>();
export function getScanProgress(scanId: string) { return scanProgress.get(scanId); }
export function clearScanProgress(scanId: string) { scanProgress.delete(scanId); }

// Track cancellation requests
const cancelledScans = new Set<string>();
export function requestCancelScan(scanId: string) { cancelledScans.add(scanId); }

export async function POST(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    const rateLimited = await enforceRateLimit(req, scanLimiter);
    if (rateLimited) return rateLimited;

    const parsed = await validateRequest(req, ScanRequestSchema);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    let parsedUrl: URL;
    try {
      parsedUrl = await assertSafeUrl(body.url);
    } catch (e) {
      if (e instanceof SsrfError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
    const targetUrl = parsedUrl.toString();
    const wcagPreset: WcagPresetId = parseWcagPreset(body.wcagPreset);
    const deepScan = Boolean(body.deepScan);
    const requiresLogin = Boolean(body.requiresLogin);
    const tags = axeTagsForPreset(wcagPreset);

    const rawCookies = body.cookies;
    const cookiesExplicit = rawCookies !== undefined && rawCookies !== null;
    const cookiesNonEmpty = cookiesExplicit && Array.isArray(rawCookies) && rawCookies.length > 0;
    if (cookiesNonEmpty && !requiresLogin) {
      return NextResponse.json(
        { error: "cookies may only be sent when requiresLogin is true." },
        { status: 400 },
      );
    }

    const cookieParse = parseAndValidateScanCookies(
      cookiesExplicit ? rawCookies : undefined,
      targetUrl,
    );
    if (!cookieParse.ok) {
      return NextResponse.json({ error: cookieParse.error }, { status: 400 });
    }
    const cookiesToSet = cookieParse.cookies;

    // ---- Cache lookup (single-page scans only) ----
    // Cache key intentionally excludes the per-request cookie payload so
    // logged-in test sessions never poison anonymous scans, and includes
    // anything that materially changes the scan output (preset, deep scan,
    // login flag, IBM toggle).
    const forceBypass =
      req.nextUrl.searchParams.get("force") === "true" || Boolean(body.force);
    const cacheOptions: Record<string, unknown> = {
      wcagPreset,
      deepScan,
      requiresLogin,
      ibm: process.env.IBM_CHECKER_ENABLED?.trim().toLowerCase() !== "false",
    };
    const isSinglePage = !Boolean(body.multiPage);
    if (isSinglePage && !forceBypass && cookiesToSet.length === 0) {
      const cached = await getCachedScan(targetUrl, cacheOptions);
      if (cached && Date.now() - cached.cachedAt <= 1000 * 60 * 10) {
        const ageSeconds = Math.round((Date.now() - cached.cachedAt) / 1000);
        console.info(`[scan] cache HIT url=${targetUrl} age=${ageSeconds}s`);
        return NextResponse.json(cached.payload, {
          headers: {
            "X-Cache": "HIT",
            "X-Cache-Age": String(ageSeconds),
          },
        });
      }
      console.info(`[scan] cache MISS url=${targetUrl}`);
    }

    // ---- Multi-page scan (async, DB-backed, requires auth) ----
    if (Boolean(body.multiPage)) {
      const session = await auth();
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Authentication required for multi-page scans" }, { status: 401 });
      }
      const maxPages = Math.min(Math.max(Number(body.maxPages) || 5, 1), 20);
      const scan = createScan(session.user.id, targetUrl, wcagPreset, maxPages);

      // Fire-and-forget background scan
      runMultiPageScan(scan.id, targetUrl, wcagPreset, tags, maxPages, deepScan, cookiesToSet).catch(
        (err) => {
          console.error(`Multi-page scan ${scan.id} failed:`, err);
          updateScan(scan.id, {
            status: "failed",
            error_message: err instanceof Error ? err.message : "Unknown error",
          });
          clearScanProgress(scan.id);
        },
      );

      return NextResponse.json({ scanId: scan.id, status: "pending" }, { status: 202 });
    }

    // ---- Original single-page scan flow (unchanged) ----
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 A11yAgent/1.0",
    );

    if (cookiesToSet.length > 0) {
      await page.setCookie(...cookiesToSet);
    }

    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 55_000 });

    if (deepScan) {
      await delay(600);
      for (let i = 0; i < 28; i++) {
        await page.keyboard.press("Tab");
        await delay(35);
      }
      await delay(400);
    }

    const axePath = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
    await page.addScriptTag({ path: axePath });

    const axeOpts: Record<string, unknown> = {
      resultTypes: ["violations", "passes", "incomplete"] as const,
    };
    if (tags.length > 0) {
      axeOpts.runOnly = { type: "tag", values: tags };
    }

    const axeStart = Date.now();
    const axeRaw = await page.evaluate(async (opts) => {
      const w = window as unknown as {
        axe?: {
          run: (ctx?: Node, o?: object) => Promise<{
            violations: import("axe-core").Result[];
            passes?: import("axe-core").Result[];
            incomplete?: import("axe-core").Result[];
          }>;
        };
      };
      if (!w.axe) {
        throw new Error("axe-core did not load in the page context");
      }
      try {
        return await w.axe.run(document, opts as object);
      } catch {
        return await w.axe.run(document, { resultTypes: ["violations", "incomplete"] });
      }
    }, axeOpts);
    const axeMs = Date.now() - axeStart;

    const violations = axeRaw.violations as import("axe-core").Result[];
    const axeIssues = normalizeAxeViolations(violations);

    const passes = (axeRaw as { passes?: import("axe-core").Result[] }).passes;
    const incomplete = (axeRaw as { incomplete?: import("axe-core").Result[] }).incomplete;
    const axeOverview = {
      passRules: Array.isArray(passes) ? passes.length : 0,
      incompleteRules: Array.isArray(incomplete) ? incomplete.length : 0,
      incompleteInstances: Array.isArray(incomplete)
        ? incomplete.reduce((n, r) => n + (r.nodes?.length ?? 0), 0)
        : 0,
    };

    const reviewIssuesAll = normalizeAxeViolations(Array.isArray(incomplete) ? incomplete : [], {
      kind: "needs_review",
    });
    const reviewIssues = reviewIssuesAll.slice(0, MAX_REVIEW_INSTANCES);

    // Generate the KV scan id up front so it doubles as the IBM scan label.
    // This id is independent of the SQLite `scan.id` (per-user history) and
    // is what the diff endpoint keys on.
    const kvScanId = randomUUID();

    // Run IBM Equal Access in the same Puppeteer page. `runIbmChecker` is
    // wrapped in try/catch internally and never throws, so axe results are
    // always returned even when IBM is disabled or crashes (per the brief).
    const ibmResult = await runIbmChecker(page, kvScanId);

    const issues = mergeFindings(axeIssues, ibmResult.issues);
    const summary = summarizeIssues(issues);

    let chromeAxSummary: ReturnType<typeof summarizeChromeAxTree> = null;
    try {
      const cdp = await page.createCDPSession();
      await cdp.send("Accessibility.enable");
      const treeRes = (await cdp.send("Accessibility.getFullAXTree", {})) as { nodes?: unknown };
      chromeAxSummary = summarizeChromeAxTree(treeRes.nodes);
    } catch {
      chromeAxSummary = null;
    }

    // Persist single-page scan to DB when user is authenticated
    let dbScanId: string | undefined;
    const persistSession = await auth();
    const persistUserId = persistSession?.user?.id;
    if (persistUserId) {
      try {
        const vCount = issues.length;
        const pCount = axeOverview.passRules;
        const iCount = axeOverview.incompleteRules;
        const score = calculateScore(vCount, pCount);
        const scan = createScan(persistUserId, targetUrl, wcagPreset, 1);
        dbScanId = scan.id;
        createScanPage(
          scan.id, targetUrl, targetUrl, score,
          vCount, pCount, iCount,
          JSON.stringify({ violations: axeRaw.violations, passes, incomplete }),
        );
        updateScan(scan.id, {
          status: "completed",
          overall_score: score,
          total_violations: vCount,
          total_passes: pCount,
          total_incomplete: iCount,
          pages_scanned: 1,
        });
      } catch (dbErr) {
        console.error("Failed to persist single-page scan to DB:", dbErr);
      }
    }

    // Persist to the URL-keyed Upstash store so the diff endpoint and any
    // future caching layer can read it back. Fire-and-forget on purpose:
    // a Redis outage must never block the scan response. `saveScan` is a
    // no-op when Upstash credentials are missing.
    const stored: StoredScanResult = {
      scanId: kvScanId,
      url: targetUrl,
      scannedAt: new Date().toISOString(),
      wcagPreset,
      issues,
      reviewIssues,
      summary,
      axeOverview,
      sources: { axe: true, ibm: ibmResult.ran },
    };
    void saveScan(stored).catch((e) => {
      console.error("[scan] saveScan failed:", e);
    });

    const responsePayload = {
      scannedUrl: targetUrl,
      issues,
      reviewIssues,
      summary,
      axeOverview,
      scanId: dbScanId,
      kvScanId,
      meta: {
        violationRules: violations.length,
        issueInstances: issues.length,
        reviewInstances: reviewIssues.length,
        reviewInstancesTotal: reviewIssuesAll.length,
        reviewInstancesCapped: reviewIssuesAll.length > reviewIssues.length,
        wcagPreset,
        deepScan,
        requiresLogin,
        cookiesApplied: cookiesToSet.length,
        requiresLoginNote: requiresLogin
          ? cookiesToSet.length > 0
            ? `Scan used ${cookiesToSet.length} imported cookie(s) for the target host before load. Session data is not stored after the scan.`
            : "Scan ran without imported cookies; results may not reflect authenticated views."
          : undefined,
        runOnlyFallback: false,
        engines: {
          axe: { ran: true, durationMs: axeMs, issueCount: axeIssues.length },
          ibm: {
            ran: ibmResult.ran,
            durationMs: ibmResult.ms,
            issueCount: ibmResult.issues.length,
            ...(ibmResult.error ? { error: ibmResult.error } : {}),
          },
        },
        engineCatalog: SCAN_ENGINE_INFO,
        chromeAxSummary,
      },
    };

    // Cache the merged response so the next request within the TTL window
    // can short-circuit Chromium + IBM. Same fire-and-forget pattern as
    // saveScan: a Redis outage must never delay the live response.
    if (isSinglePage && cookiesToSet.length === 0) {
      void setCachedScan(targetUrl, cacheOptions, responsePayload).catch((e) => {
        console.error("[scan] setCachedScan failed:", e);
      });
    }

    return NextResponse.json(responsePayload, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (err) {
    let message = err instanceof Error ? err.message : "Scan failed";
    if (message.includes("ENOENT") || message.includes("ENOEXEC")) {
      message =
        "Could not start the browser. On macOS/Windows the app uses your installed Chrome—install Google Chrome or set PUPPETEER_EXECUTABLE_PATH. (Bundled Chromium is for Linux/serverless only.)";
    }
    return NextResponse.json(
      { error: message },
      { status: message.toLowerCase().includes("timeout") ? 504 : 500 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

// --------------- Multi-page background scan ---------------

async function runMultiPageScan(
  scanId: string,
  baseUrl: string,
  wcagPreset: WcagPresetId,
  tags: string[],
  maxPages: number,
  deepScan: boolean,
  cookiesToSet: Array<{ name: string; value: string; domain: string; path?: string }>,
) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    updateScan(scanId, { status: "crawling" });
    scanProgress.set(scanId, { phase: "crawling", message: "Discovering pages...", pagesScanned: 0, pagesTotal: 0, score: null });

    browser = await launchBrowser();

    const pages = await discoverPages(browser, baseUrl, maxPages);
    const pagesTotal = pages.length;
    updateScan(scanId, { status: "scanning", pages_total: pagesTotal });
    scanProgress.set(scanId, { phase: "scanning", message: `Scanning ${pagesTotal} page(s)...`, pagesScanned: 0, pagesTotal, score: null });

    let totalViolations = 0;
    let totalPasses = 0;
    let totalIncomplete = 0;
    const axePath = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

    for (let i = 0; i < pages.length; i++) {
      if (cancelledScans.has(scanId)) {
        cancelledScans.delete(scanId);
        updateScan(scanId, { status: "cancelled" });
        clearScanProgress(scanId);
        return;
      }

      const pageUrl = pages[i];
      const page = await browser.newPage();
      try {
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 A11yAgent/1.0",
        );
        if (cookiesToSet.length > 0) await page.setCookie(...cookiesToSet);

        await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 45_000 });

        if (deepScan) {
          await delay(400);
          for (let t = 0; t < 28; t++) {
            await page.keyboard.press("Tab");
            await delay(30);
          }
          await delay(300);
        }

        await page.addScriptTag({ path: axePath });

        const axeOpts: Record<string, unknown> = {
          resultTypes: ["violations", "passes", "incomplete"] as const,
        };
        if (tags.length > 0) axeOpts.runOnly = { type: "tag", values: tags };

        const axeRaw = await page.evaluate(async (opts) => {
          const w = window as unknown as {
            axe?: { run: (ctx?: Node, o?: object) => Promise<{ violations: unknown[]; passes?: unknown[]; incomplete?: unknown[] }> };
          };
          if (!w.axe) throw new Error("axe-core did not load");
          try { return await w.axe.run(document, opts as object); }
          catch { return await w.axe.run(document, { resultTypes: ["violations", "incomplete"] }); }
        }, axeOpts);

        const pageTitle = await page.title();
        const violations = axeRaw.violations as import("axe-core").Result[];
        const passes = (axeRaw as { passes?: import("axe-core").Result[] }).passes ?? [];
        const incomplete = (axeRaw as { incomplete?: import("axe-core").Result[] }).incomplete ?? [];
        const vCount = violations.reduce((n, v) => n + (v.nodes?.length || 1), 0);
        const pCount = Array.isArray(passes) ? passes.length : 0;
        const iCount = incomplete.reduce((n, v) => n + (v.nodes?.length || 1), 0);
        const pageScore = calculateScore(vCount, pCount);

        totalViolations += vCount;
        totalPasses += pCount;
        totalIncomplete += iCount;

        createScanPage(
          scanId, pageUrl, pageTitle, pageScore,
          vCount, pCount, iCount,
          JSON.stringify({ violations, passes, incomplete }),
        );
      } catch (err) {
        createScanPage(scanId, pageUrl, "Error", 0, 0, 0, 0,
          JSON.stringify({ error: err instanceof Error ? err.message : "Page scan failed" }),
        );
      } finally {
        await page.close();
      }

      const pagesScanned = i + 1;
      const runningScore = calculateScore(totalViolations, totalPasses);
      updateScan(scanId, { pages_scanned: pagesScanned, total_violations: totalViolations, total_passes: totalPasses, total_incomplete: totalIncomplete, overall_score: runningScore });
      scanProgress.set(scanId, { phase: "scanning", message: `Scanned ${pagesScanned}/${pagesTotal}`, pagesScanned, pagesTotal, score: runningScore });
    }

    const overallScore = calculateScore(totalViolations, totalPasses);
    updateScan(scanId, {
      status: "completed",
      overall_score: overallScore,
      completed_at: new Date().toISOString(),
    });
    scanProgress.set(scanId, { phase: "completed", message: "Scan complete", pagesScanned: pagesTotal, pagesTotal, score: overallScore });

    setTimeout(() => clearScanProgress(scanId), 60_000);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
