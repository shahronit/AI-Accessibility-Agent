import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = dirname(__filename);

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
    "axe-core",
    "better-sqlite3",
    // accessibility-checker uses dynamic require() of compiled engines + an
    // optional baseline file. Keeping it external prevents Turbopack from
    // tracing those dynamic imports and lets it load via Node's runtime
    // require, which is what the IBM engine expects.
    "accessibility-checker",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  turbopack: {
    root,
  },
};

export default nextConfig;
