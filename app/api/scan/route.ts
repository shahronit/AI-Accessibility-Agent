import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { getPuppeteerLaunchConfig } from "@/lib/browserLaunch";
import { validateScanUrl } from "@/lib/url";
import { normalizeAxeViolations, summarizeIssues } from "@/lib/axeScanner";

export const maxDuration = 60;
export const runtime = "nodejs";

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
    const body = (await req.json()) as { url?: unknown };
    const rawUrl = typeof body.url === "string" ? body.url : "";
    const validation = validateScanUrl(rawUrl);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const targetUrl = validation.url;
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 A11yScanner/1.0",
    );

    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 55_000 });

    const axePath = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
    await page.addScriptTag({ path: axePath });

    const axeRaw = await page.evaluate(async () => {
      const w = window as unknown as {
        axe?: { run: (ctx?: Node, opts?: object) => Promise<{ violations: unknown[] }> };
      };
      if (!w.axe) {
        throw new Error("axe-core did not load in the page context");
      }
      return w.axe.run(document, { resultTypes: ["violations"] });
    });

    const violations = axeRaw.violations as import("axe-core").Result[];
    const issues = normalizeAxeViolations(violations);
    const summary = summarizeIssues(issues);

    return NextResponse.json({
      scannedUrl: targetUrl,
      issues,
      summary,
      meta: {
        violationRules: violations.length,
        issueInstances: issues.length,
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
