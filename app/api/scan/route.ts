import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { getPuppeteerLaunchConfig } from "@/lib/browserLaunch";
import { validateScanUrl } from "@/lib/url";
import { normalizeAxeViolations, summarizeIssues } from "@/lib/axeScanner";
import { axeTagsForPreset, parseWcagPreset, type WcagPresetId } from "@/lib/wcagAxeTags";

export const maxDuration = 60;
export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    const body = (await req.json()) as {
      url?: unknown;
      wcagPreset?: unknown;
      deepScan?: unknown;
      requiresLogin?: unknown;
      /** When true, response includes pass/incomplete rule counts from axe (same run). */
      includeAxeOverview?: unknown;
    };
    const rawUrl = typeof body.url === "string" ? body.url : "";
    const validation = validateScanUrl(rawUrl);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const targetUrl = validation.url;
    const wcagPreset: WcagPresetId = parseWcagPreset(body.wcagPreset);
    const deepScan = Boolean(body.deepScan);
    const requiresLogin = Boolean(body.requiresLogin);
    const includeAxeOverview = Boolean(body.includeAxeOverview);
    const tags = axeTagsForPreset(wcagPreset);

    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 A11yAgent/1.0",
    );

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
      resultTypes: includeAxeOverview ? (["violations", "passes", "incomplete"] as const) : (["violations"] as const),
    };
    if (tags.length > 0) {
      axeOpts.runOnly = { type: "tag", values: tags };
    }

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
        return await w.axe.run(document, { resultTypes: ["violations"] });
      }
    }, axeOpts);

    const violations = axeRaw.violations as import("axe-core").Result[];
    const issues = normalizeAxeViolations(violations);
    const summary = summarizeIssues(issues);

    const passes = (axeRaw as { passes?: import("axe-core").Result[] }).passes;
    const incomplete = (axeRaw as { incomplete?: import("axe-core").Result[] }).incomplete;
    const axeOverview = includeAxeOverview
      ? {
          passRules: Array.isArray(passes) ? passes.length : 0,
          incompleteRules: Array.isArray(incomplete) ? incomplete.length : 0,
          incompleteInstances: Array.isArray(incomplete)
            ? incomplete.reduce((n, r) => n + (r.nodes?.length ?? 0), 0)
            : 0,
        }
      : undefined;

    return NextResponse.json({
      scannedUrl: targetUrl,
      issues,
      summary,
      axeOverview,
      meta: {
        violationRules: violations.length,
        issueInstances: issues.length,
        wcagPreset,
        deepScan,
        requiresLogin,
        requiresLoginNote: requiresLogin
          ? "Scan ran without your credentials; results may not reflect authenticated views."
          : undefined,
        runOnlyFallback: false,
      },
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
