import type { Browser } from "puppeteer-core";
import { validateUrlSafeWithDns } from "@/lib/url";

const SKIP_EXTENSIONS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
  ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".css", ".js", ".json", ".xml", ".rss", ".atom",
  ".woff", ".woff2", ".ttf", ".eot",
]);

const SKIP_PATH_PATTERNS = [
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/admin\//i,
  /\/logout/i,
  /\/sign-out/i,
  /\/cdn-cgi\//i,
];

function shouldSkipUrl(href: string): boolean {
  try {
    const u = new URL(href);
    const path = u.pathname.toLowerCase();
    const ext = path.substring(path.lastIndexOf("."));
    if (SKIP_EXTENSIONS.has(ext)) return true;
    if (u.hash) return true;
    if (SKIP_PATH_PATTERNS.some((p) => p.test(path))) return true;
    return false;
  } catch {
    return true;
  }
}

function cleanUrl(origin: string, pathname: string): string {
  const clean = pathname.replace(/\/$/, "") || "/";
  return `${origin}${clean}`;
}

const PRIORITY_PATTERNS = [
  /^\/$/, /^\/index/i,
  /\/about/i, /\/contact/i, /\/help/i, /\/faq/i,
  /\/services/i, /\/products/i,
  /\/blog$/i, /\/news$/i,
  /\/privacy/i, /\/terms/i, /\/accessibility/i,
];

function prioritizePages(urls: string[]): string[] {
  return [...urls].sort((a, b) => {
    const pathA = new URL(a).pathname;
    const pathB = new URL(b).pathname;
    const scoreA = PRIORITY_PATTERNS.findIndex((p) => p.test(pathA));
    const scoreB = PRIORITY_PATTERNS.findIndex((p) => p.test(pathB));
    const sa = scoreA === -1 ? 999 : scoreA;
    const sb = scoreB === -1 ? 999 : scoreB;
    return sa - sb;
  });
}

async function trySitemap(browser: Browser, origin: string): Promise<string[]> {
  const urls: string[] = [];
  const page = await browser.newPage();
  try {
    const sitemapUrl = `${origin}/sitemap.xml`;
    const response = await page.goto(sitemapUrl, { waitUntil: "networkidle2", timeout: 10_000 });
    if (response && response.ok()) {
      const text = await page.evaluate(() => document.body?.innerText || "");
      const matches = text.match(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi);
      if (matches) {
        for (const m of matches) {
          const loc = m.replace(/<\/?loc>/gi, "").trim();
          if (loc.startsWith(origin) && !shouldSkipUrl(loc)) {
            urls.push(loc);
          }
        }
      }
    }
  } catch {
    /* sitemap not available */
  } finally {
    await page.close();
  }
  return urls;
}

/**
 * Discover pages on a website by checking sitemap.xml and following links.
 * Returns up to `maxPages` validated, same-origin URLs.
 */
export async function discoverPages(
  browser: Browser,
  baseUrl: string,
  maxPages: number,
): Promise<string[]> {
  const origin = new URL(baseUrl).origin;
  const found = new Set<string>();
  found.add(cleanUrl(origin, new URL(baseUrl).pathname));

  // 1. Try sitemap
  const sitemapUrls = await trySitemap(browser, origin);
  for (const u of sitemapUrls) {
    if (found.size >= maxPages * 2) break;
    found.add(u);
  }

  // 2. Crawl homepage for links
  if (found.size < maxPages) {
    const page = await browser.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 15_000 });
      const hrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"), (a) => (a as HTMLAnchorElement).href),
      );
      for (const href of hrefs) {
        if (found.size >= maxPages * 3) break;
        try {
          const u = new URL(href);
          if (u.origin !== origin) continue;
          const clean = cleanUrl(origin, u.pathname);
          if (!shouldSkipUrl(clean)) found.add(clean);
        } catch {
          /* invalid URL */
        }
      }
    } catch {
      /* homepage crawl failed */
    } finally {
      await page.close();
    }
  }

  // 3. SSRF-validate all discovered URLs
  const validated: string[] = [];
  for (const url of found) {
    const check = await validateUrlSafeWithDns(url);
    if (check.ok) validated.push(url);
    if (validated.length >= maxPages) break;
  }

  return prioritizePages(validated).slice(0, maxPages);
}
