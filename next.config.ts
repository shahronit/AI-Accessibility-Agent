import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "axe-core", "better-sqlite3"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
