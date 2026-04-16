/**
 * URL validation and basic SSRF hardening for server-side navigation.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1, 5).map((x) => Number(x));
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".localhost")) return true;
  if (h.endsWith(".local")) return true;
  return false;
}

export type UrlValidationResult =
  | { ok: true; url: string; parsed: URL }
  | { ok: false; error: string };

/**
 * Normalize user input into https URL when scheme is omitted.
 */
export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/** Decode a query param that may be multiply-encoded (e.g. from bookmarklets or redirects). */
export function decodeScanUrlParam(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s;
}

export function validateScanUrl(raw: string): UrlValidationResult {
  const input = raw.trim();
  if (!input) {
    return { ok: false, error: "URL is required." };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizeUrlInput(input));
  } catch {
    return { ok: false, error: "Invalid URL format." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed." };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { ok: false, error: "Missing hostname." };
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, error: "This host is not allowed to be scanned." };
  }

  if (isPrivateIpv4(hostname)) {
    return { ok: false, error: "Private IP addresses cannot be scanned." };
  }

  // Block obvious IPv6 loopback / unique local (lightweight check)
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const inner = hostname.slice(1, -1).toLowerCase();
    if (inner === "::1" || inner.startsWith("fe80:") || inner.startsWith("fc") || inner.startsWith("fd")) {
      return { ok: false, error: "This address is not allowed to be scanned." };
    }
  }

  return { ok: true, url: parsed.toString(), parsed };
}

// --------------- DNS-resolving SSRF guard (server-only) ---------------

function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower === "::") return true;
  return false;
}

/**
 * Resolve hostname via DNS and verify that none of the resolved IPs are private.
 * This mitigates DNS rebinding and prevents SSRF through hostnames that resolve
 * to internal addresses. Server-only — uses Node dns module.
 */
export async function validateUrlSafeWithDns(urlString: string): Promise<UrlValidationResult> {
  const basic = validateScanUrl(urlString);
  if (!basic.ok) return basic;

  const { hostname } = basic.parsed;

  // Skip DNS check for direct IP addresses (already checked by validateScanUrl)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return basic;
  }

  try {
    const dns = await import("node:dns");
    const { resolve4, resolve6 } = dns.promises;

    const [v4addrs, v6addrs] = await Promise.allSettled([
      resolve4(hostname),
      resolve6(hostname),
    ]);

    const ips: string[] = [];
    if (v4addrs.status === "fulfilled") ips.push(...v4addrs.value);
    if (v6addrs.status === "fulfilled") ips.push(...v6addrs.value);

    if (ips.length === 0) {
      return { ok: false, error: "Could not resolve hostname." };
    }

    for (const ip of ips) {
      if (isPrivateIpv4(ip) || isPrivateIpv6(ip)) {
        return { ok: false, error: "This host resolves to a private IP address and cannot be scanned." };
      }
    }
  } catch {
    return { ok: false, error: "DNS resolution failed for this hostname." };
  }

  return basic;
}

/**
 * Compact host + path (+ search) for in-app scan progress logs.
 */
export function formatUrlForScanLog(href: string, maxLen = 72): string {
  try {
    const u = new URL(href);
    const path = u.pathname === "/" ? "" : u.pathname;
    const out = `${u.hostname}${path}${u.search || ""}`;
    if (out.length <= maxLen) return out;
    return `${out.slice(0, Math.max(8, maxLen - 1))}…`;
  } catch {
    const t = href.trim();
    if (t.length <= maxLen) return t;
    return `${t.slice(0, Math.max(8, maxLen - 1))}…`;
  }
}
