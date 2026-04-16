const DEFAULT_BASE = "http://localhost:3000";

const TAG_MAP = {
  wcag2a: ["wcag2a"],
  wcag2aa: ["wcag2a", "wcag2aa"],
  wcag21aa: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
  wcag22aa: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
  wcag2aaa: ["wcag2a", "wcag2aa", "wcag2aaa"],
};

let lastResults = null;

function setStatus(msg, isError) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.className = isError ? "error" : "";
}

function renderResults(results) {
  const area = document.getElementById("results-area");
  const scoreEl = document.getElementById("score-value");
  const breakdownEl = document.getElementById("severity-breakdown");
  if (!area || !scoreEl || !breakdownEl) return;

  const violations = results.violations || [];
  const passes = results.passes || [];
  const totalV = violations.reduce((n, v) => n + (v.nodes?.length || 1), 0);
  const totalP = passes.length;
  const total = totalV + totalP;
  const score = total === 0 ? 100 : Math.round((totalP / total) * 1000) / 10;

  scoreEl.textContent = score;
  scoreEl.className =
    "score-value " + (score >= 90 ? "score-good" : score >= 70 ? "score-ok" : "score-bad");

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) {
    const impact = v.impact || "moderate";
    const nodeCount = v.nodes?.length || 1;
    counts[impact] = (counts[impact] || 0) + nodeCount;
  }

  breakdownEl.innerHTML = "";
  for (const [level, count] of Object.entries(counts)) {
    const row = document.createElement("div");
    row.className = "severity-row";
    row.innerHTML = `<span class="sev-badge sev-${level}">${level}</span><span class="sev-count">${count}</span>`;
    breakdownEl.appendChild(row);
  }

  area.style.display = "block";

  // Update badge
  chrome.action.setBadgeText({ text: String(totalV) });
  chrome.action.setBadgeBackgroundColor({
    color: totalV === 0 ? "#10b981" : totalV < 10 ? "#ca8a04" : "#dc2626",
  });
}

// --- Scan ---
document.getElementById("scan")?.addEventListener("click", async () => {
  const scanBtn = document.getElementById("scan");
  const overlayBtn = document.getElementById("toggle-overlay");
  const copyBtn = document.getElementById("copy-report");
  if (scanBtn) scanBtn.disabled = true;
  setStatus("Scanning...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith("chrome://")) {
      setStatus("Cannot scan this page.", true);
      if (scanBtn) scanBtn.disabled = false;
      return;
    }

    const wcagLevel = document.getElementById("wcag-level")?.value || "wcag2aa";
    const tags = TAG_MAP[wcagLevel] || TAG_MAP.wcag2aa;

    // Inject axe-core
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/axe.min.js"],
    });

    // Run axe
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (axeTags) => {
        return window.axe.run(document, {
          runOnly: { type: "tag", values: axeTags },
          resultTypes: ["violations", "passes", "incomplete"],
        });
      },
      args: [tags],
    });

    lastResults = result;
    renderResults(result);
    setStatus(
      `Found ${result.violations?.length || 0} rules with violations.`,
    );

    if (overlayBtn) overlayBtn.disabled = false;
    if (copyBtn) copyBtn.disabled = false;

    // Store results for overlay
    await chrome.storage.local.set({ lastScanResults: result, lastScanTabId: tab.id });
  } catch (err) {
    setStatus("Scan failed: " + (err.message || err), true);
  } finally {
    if (scanBtn) scanBtn.disabled = false;
  }
});

// --- Toggle overlay ---
document.getElementById("toggle-overlay")?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  const data = await chrome.storage.local.get(["lastScanResults", "lastScanTabId"]);
  if (data.lastScanTabId !== tab.id || !data.lastScanResults) {
    setStatus("Run a scan first on this tab.", true);
    return;
  }

  await chrome.tabs.sendMessage(tab.id, {
    type: "TOGGLE_OVERLAY",
    violations: data.lastScanResults.violations || [],
  });
});

// --- Copy report ---
document.getElementById("copy-report")?.addEventListener("click", async () => {
  if (!lastResults) {
    setStatus("Run a scan first.", true);
    return;
  }

  const violations = lastResults.violations || [];
  let text = `A11yAgent Accessibility Report\n`;
  text += `URL: ${(await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url || "Unknown"}\n`;
  text += `Date: ${new Date().toISOString()}\n\n`;
  text += `Violations: ${violations.length} rules\n\n`;

  for (const v of violations) {
    text += `[${(v.impact || "").toUpperCase()}] ${v.id} — ${v.help || v.description}\n`;
    text += `  Nodes: ${v.nodes?.length || 0}\n`;
    text += `  Help: ${v.helpUrl || ""}\n\n`;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Report copied to clipboard.");
  } catch {
    setStatus("Could not copy to clipboard.", true);
  }
});

// --- Send to app (existing URL bridge) ---
document.getElementById("send-to-app")?.addEventListener("click", async () => {
  setStatus("");
  const baseInput = document.getElementById("base");
  let base = (baseInput?.value || "").trim() || DEFAULT_BASE;
  base = base.replace(/\/$/, "");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabUrl = tab?.url ?? "";
  if (!tabUrl || tabUrl.startsWith("chrome://") || tabUrl.startsWith("chrome-extension://")) {
    setStatus("This tab has no http(s) URL to send.", true);
    return;
  }

  const next = `${base}/scan?prefillUrl=${encodeURIComponent(tabUrl)}&requiresLogin=1`;
  await chrome.storage.local.set({ scannerBaseUrl: base });
  await chrome.tabs.create({ url: next });
  window.close();
});

// --- Restore saved base URL ---
chrome.storage.local.get(["scannerBaseUrl"]).then((r) => {
  const el = document.getElementById("base");
  if (el && typeof r.scannerBaseUrl === "string" && r.scannerBaseUrl) {
    el.value = r.scannerBaseUrl;
  }
});
