import { formatUrlForScanLog } from "@/lib/url";

/**
 * Client-side runtime lines while POST /api/scan is in flight.
 * Each line describes work being done on the target URL only.
 */
export function scanRuntimeStageMessages(deepScan: boolean, targetUrl: string): string[] {
  const label = formatUrlForScanLog(targetUrl, 80);
  const keyboard = deepScan
    ? [`${label} — Tab through focusable elements on this page (thorough pass).`]
    : [`${label} — Skipping thorough keyboard pass (option off).`];

  return [
    `${label} — Load page in browser and wait until network is idle.`,
    ...keyboard,
    `${label} — Run accessibility checks (violations, passes, needs review).`,
    `${label} — Capture accessibility tree for this page.`,
    `${label} — Prepare scan results.`,
  ];
}
