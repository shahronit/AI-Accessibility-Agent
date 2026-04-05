import fs from "node:fs";

/**
 * Flags safe for desktop Chrome/Chromium (not Lambda-specific).
 */
const LOCAL_CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

function findChromeOnDarwin(): string | null {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Arc.app/Contents/MacOS/Arc",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findChromeOnWin32(): string | null {
  const pf = process.env.PROGRAMFILES || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const candidates = [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export type PuppeteerLaunchConfig = {
  executablePath: string;
  args: string[];
  headless: boolean;
};

/**
 * @sparticuz/chromium ships a **Linux** Chromium (for Lambda/Vercel). On macOS/Windows,
 * spawning it causes `spawn ENOEXEC`. Use installed Chrome locally; use Sparticuz on Linux.
 */
export async function getPuppeteerLaunchConfig(): Promise<PuppeteerLaunchConfig> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (envPath) {
    if (!fs.existsSync(envPath)) {
      throw new Error(`PUPPETEER_EXECUTABLE_PATH does not exist: ${envPath}`);
    }
    return { executablePath: envPath, args: LOCAL_CHROME_ARGS, headless: true };
  }

  if (process.platform === "darwin") {
    const chrome = findChromeOnDarwin();
    if (!chrome) {
      throw new Error(
        "Install Google Chrome (or Chromium/Edge) or set PUPPETEER_EXECUTABLE_PATH to its binary. Expected e.g. /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      );
    }
    return { executablePath: chrome, args: LOCAL_CHROME_ARGS, headless: true };
  }

  if (process.platform === "win32") {
    const chrome = findChromeOnWin32();
    if (!chrome) {
      throw new Error(
        "Install Google Chrome or Microsoft Edge, or set PUPPETEER_EXECUTABLE_PATH to chrome.exe / msedge.exe.",
      );
    }
    return { executablePath: chrome, args: LOCAL_CHROME_ARGS, headless: true };
  }

  // Linux (Vercel, Docker, etc.): bundled serverless Chromium (Linux binary only).
  const chromium = (await import("@sparticuz/chromium")).default;
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  };
}
