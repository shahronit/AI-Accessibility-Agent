/**
 * What powers a scan vs what must stay manual (honest product mapping).
 * IBM / NVDA are named because users compare tools—only axe + Chromium AX are automated here.
 */
export type ScanEngineInfo = {
  id: string;
  name: string;
  role: "automated" | "partial" | "manual";
  detail: string;
};

export const SCAN_ENGINE_INFO: ScanEngineInfo[] = [
  {
    id: "axe-core",
    name: "axe-core (Deque)",
    role: "automated",
    detail:
      "Same open-source rule engine used by axe DevTools and many CI pipelines. Runs WCAG-tagged rules in the page.",
  },
  {
    id: "chromium-ax-tree",
    name: "Chromium accessibility tree",
    role: "partial",
    detail:
      "Sampled after load via Chrome DevTools Protocol (similar data to Chrome’s Accessibility tree inspector—not a second linter).",
  },
  {
    id: "chrome-a11y-panel",
    name: "Chrome Accessibility pane",
    role: "manual",
    detail:
      "The browser UI for inspecting nodes is manual; this app does not remote-control that panel, only reads the underlying tree snapshot.",
  },
  {
    id: "ibm-equal-access",
    name: "IBM Equal Access / Accessibility Checker",
    role: "manual",
    detail:
      "Separate IBM product with its own rules and reporting. Not bundled here; use it in addition if your org requires it.",
  },
  {
    id: "nvda",
    name: "NVDA / JAWS / VoiceOver",
    role: "manual",
    detail:
      "Real screen reader UX is never fully captured by automation. Use assistive technology on top of these scan results.",
  },
];
