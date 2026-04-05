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
