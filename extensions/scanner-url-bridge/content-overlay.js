const OVERLAY_ID = "a11yagent-overlay";
const HIGHLIGHT_CLASS = "a11yagent-highlight";

const IMPACT_COLORS = {
  critical: "#dc2626",
  serious: "#ea580c",
  moderate: "#ca8a04",
  minor: "#2563eb",
};

let overlayVisible = false;

function injectStyles() {
  if (document.getElementById("a11yagent-styles")) return;
  const style = document.createElement("style");
  style.id = "a11yagent-styles";
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline-width: 3px !important;
      outline-style: solid !important;
      outline-offset: 2px !important;
      position: relative !important;
    }
    .${HIGHLIGHT_CLASS}::after {
      content: attr(data-a11y-rule);
      position: absolute;
      top: -18px;
      left: 0;
      background: rgba(0,0,0,0.85);
      color: white;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      white-space: nowrap;
      z-index: 2147483647;
      pointer-events: none;
      font-family: system-ui, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

function clearOverlay() {
  const existing = document.querySelectorAll("." + HIGHLIGHT_CLASS);
  existing.forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
    el.style.removeProperty("outline-color");
    el.removeAttribute("data-a11y-rule");
  });
  overlayVisible = false;
}

function showOverlay(violations) {
  injectStyles();
  clearOverlay();

  for (const v of violations) {
    const color = IMPACT_COLORS[v.impact] || IMPACT_COLORS.moderate;
    for (const node of v.nodes || []) {
      const targets = node.target || [];
      for (const selectorList of targets) {
        const selector = Array.isArray(selectorList) ? selectorList[0] : selectorList;
        if (typeof selector !== "string") continue;
        try {
          const el = document.querySelector(selector);
          if (el) {
            el.classList.add(HIGHLIGHT_CLASS);
            el.style.setProperty("outline-color", color, "important");
            el.setAttribute("data-a11y-rule", `${v.impact}: ${v.id}`);
          }
        } catch {
          /* selector may be invalid */
        }
      }
    }
  }

  overlayVisible = true;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOGGLE_OVERLAY") {
    if (overlayVisible) {
      clearOverlay();
    } else {
      showOverlay(msg.violations || []);
    }
  } else if (msg.type === "CLEAR_OVERLAY") {
    clearOverlay();
  }
});
