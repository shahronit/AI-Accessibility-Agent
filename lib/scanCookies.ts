/**
 * Validate cookies for Puppeteer `page.setCookie` before `goto` (POST /api/scan).
 * Domain must apply to the scan URL host. Payload is ephemeral (not stored).
 */

const MAX_COOKIES = 60;
const MAX_NAME_LEN = 256;
const MAX_VALUE_LEN = 4096;
const MAX_TOTAL_VALUE_BYTES = 48_000;

export type ScanSetCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

function normalizeCookieDomain(raw: string): string {
  return raw.trim().replace(/^\./, "").toLowerCase();
}

/** True if a Set-Cookie-style domain may be sent to `hostname` (scan target host). */
export function cookieDomainAppliesToHost(hostname: string, cookieDomainRaw: string): boolean {
  const cd = normalizeCookieDomain(cookieDomainRaw);
  const h = hostname.toLowerCase();
  if (!cd || !h) return false;
  if (h === cd) return true;
  if (h.endsWith(`.${cd}`)) return true;
  return false;
}

function puppeteerDomain(domainRaw: string, host: string): string {
  const trimmed = domainRaw.trim();
  if (trimmed.startsWith(".")) return trimmed;
  const n = normalizeCookieDomain(trimmed);
  if (n === host.toLowerCase()) return host;
  return `.${n}`;
}

function parseSameSite(raw: unknown): "Strict" | "Lax" | "None" | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  if (s === "Strict" || s === "Lax" || s === "None") return s;
  const lower = s.toLowerCase();
  if (lower === "strict") return "Strict";
  if (lower === "lax") return "Lax";
  if (lower === "none") return "None";
  return undefined;
}

function normalizeExpires(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n > 1e12) return Math.round(n / 1000);
  return Math.round(n);
}

/**
 * Parse `body.cookies`: JSON array of { name, value, domain, path, ... }.
 * Returns objects safe for `page.setCookie(...cookies)`.
 */
export function parseAndValidateScanCookies(
  raw: unknown,
  scanUrl: string,
): { ok: true; cookies: ScanSetCookie[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, cookies: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "cookies must be a JSON array of objects." };
  }
  if (raw.length > MAX_COOKIES) {
    return { ok: false, error: `Too many cookies (max ${MAX_COOKIES}).` };
  }

  let parsed: URL;
  try {
    parsed = new URL(scanUrl);
  } catch {
    return { ok: false, error: "Invalid scan URL for cookie validation." };
  }
  const host = parsed.hostname;
  if (!host) {
    return { ok: false, error: "Scan URL has no hostname." };
  }

  const out: ScanSetCookie[] = [];
  let totalValueBytes = 0;

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `cookies[${i}] must be an object.` };
    }
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const value = typeof o.value === "string" ? o.value : o.value == null ? "" : String(o.value);
    const domain = typeof o.domain === "string" ? o.domain.trim() : "";
    const pathRaw = typeof o.path === "string" ? o.path.trim() : "";

    if (!name || name.length > MAX_NAME_LEN) {
      return { ok: false, error: `cookies[${i}].name is missing or too long.` };
    }
    if (value.length > MAX_VALUE_LEN) {
      return { ok: false, error: `cookies[${i}].value is too long (max ${MAX_VALUE_LEN}).` };
    }
    totalValueBytes += new TextEncoder().encode(value).length;
    if (totalValueBytes > MAX_TOTAL_VALUE_BYTES) {
      return { ok: false, error: "Total cookie payload size is too large." };
    }
    if (!domain) {
      return { ok: false, error: `cookies[${i}].domain is required.` };
    }
    if (!cookieDomainAppliesToHost(host, domain)) {
      return {
        ok: false,
        error: `cookies[${i}].domain does not match the scan host (${host}).`,
      };
    }

    const path = pathRaw && pathRaw.startsWith("/") ? pathRaw : pathRaw ? `/${pathRaw}` : "/";
    const httpOnly = typeof o.httpOnly === "boolean" ? o.httpOnly : undefined;
    const secure = typeof o.secure === "boolean" ? o.secure : undefined;
    const sameSite = parseSameSite(o.sameSite);
    const expires = normalizeExpires(o.expires);

    const entry: ScanSetCookie = {
      name,
      value,
      domain: puppeteerDomain(domain, host),
      path,
    };
    if (expires !== undefined) entry.expires = expires;
    if (httpOnly !== undefined) entry.httpOnly = httpOnly;
    if (secure !== undefined) entry.secure = secure;
    if (sameSite !== undefined) entry.sameSite = sameSite;

    out.push(entry);
  }

  return { ok: true, cookies: out };
}
