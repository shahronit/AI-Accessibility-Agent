import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless Chromium + Puppeteer must not be bundled into the serverless function graph.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "axe-core"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
