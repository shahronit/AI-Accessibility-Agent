import type { HTTPResponse, Page } from "puppeteer-core";

export type GotoWithSoftIdleOptions = {
  /**
   * Hard deadline for `DOMContentLoaded`. If the document doesn't fire
   * DCL within this window the navigation throws — that's a real failure
   * (DNS, TCP/TLS, 5xx, etc.) and we want it to surface to the caller.
   *
   * Default: 60 s. Heavy SSR + redirect chains routinely take 10-20 s
   * even on healthy sites; 60 s gives enough headroom while still
   * catching truly stuck connections.
   */
  navigationTimeoutMs?: number;
  /**
   * Soft, *non-fatal* wait for network quiescence AFTER DCL. Gives SPA
   * frameworks, lazy chunks, web fonts, and late-loading images a
   * bounded chance to render before axe-core scans the DOM.
   *
   * If the page never goes idle (very common — analytics beacons,
   * chat widgets, long-poll WebSockets, video heartbeats keep at
   * least one connection open forever) we proceed anyway because the
   * DOM is interactive and axe-core will produce useful results
   * against the current snapshot.
   *
   * Default: 6 s.
   */
  settleTimeoutMs?: number;
  /**
   * `idleTime` argument to Puppeteer's `waitForNetworkIdle` — how long
   * the connection count must stay below the threshold to count as
   * "settled". Default: 500 ms.
   */
  idleTimeMs?: number;
};

/**
 * Two-stage navigation that's robust against the "networkidle2 trap".
 *
 * Why not `waitUntil: "networkidle2"`?
 *   Modern sites keep persistent connections open for analytics, chat
 *   widgets, WebSockets, live polls, and video heartbeats. The page is
 *   rendered and interactive within 1-3 s but the connection count
 *   never drops to <= 2 for 500 ms straight. `networkidle2` therefore
 *   times out even though the page is ready — producing the cryptic
 *   `Navigation timeout of NN ms exceeded` error.
 *
 * Strategy:
 *   1. `goto(url, { waitUntil: "domcontentloaded" })` — fires reliably
 *      for any reachable page within seconds. This is the load gate.
 *   2. `waitForNetworkIdle({ ..., timeout: settleTimeoutMs })` wrapped
 *      in `.catch(() => undefined)` — best-effort settle. If it times
 *      out, we just continue: the DOM is already interactive.
 *
 * This mirrors what Lighthouse and Pa11y do internally for the same
 * reason.
 */
export async function gotoWithSoftIdle(
  page: Page,
  url: string,
  opts: GotoWithSoftIdleOptions = {},
): Promise<HTTPResponse | null> {
  const navTimeout = opts.navigationTimeoutMs ?? 60_000;
  const settleTimeout = opts.settleTimeoutMs ?? 6_000;
  const idleTime = opts.idleTimeMs ?? 500;

  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: navTimeout,
  });

  // Race: either the network goes idle OR a client-side navigation
  // happens (meta-refresh, JS redirect to login, SPA route swap). Both
  // are absorbed silently — without this race, the next `evaluate` /
  // `addScriptTag` after a self-redirect throws "Execution context was
  // destroyed, most likely because of a navigation".
  await Promise.race([
    page.waitForNetworkIdle({ idleTime, timeout: settleTimeout }),
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: settleTimeout }),
  ]).catch(() => undefined);

  // If a client-side nav fired above, give the new document a short
  // second chance to settle before the caller starts injecting scripts.
  await page
    .waitForNetworkIdle({ idleTime, timeout: 2_000 })
    .catch(() => undefined);

  return response;
}
