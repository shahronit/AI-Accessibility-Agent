import { promises as dns, type LookupAddress } from "node:dns";
import { validateScanUrl } from "@/lib/url";

/**
 * Server-side SSRF guard for any URL we are about to fetch / navigate to with
 * a headless browser or HTTP client.
 *
 * Defends against:
 *   - Oversized URLs (DoS, log poisoning)            -> length cap
 *   - Non-http(s) schemes (file://, javascript://)   -> scheme allowlist
 *   - Hostname blocklist (localhost, *.local, ...)   -> validateScanUrl
 *   - Direct IP literals to private ranges           -> validateScanUrl
 *   - DNS rebinding to internal IPs                  -> dns.lookup + IP check
 *   - IPv4-mapped IPv6 (::ffff:127.0.0.1) bypass     -> dual-family check
 *
 * IMPORTANT: we use `dns.promises.lookup` (which goes through the OS resolver
 * + /etc/hosts) rather than `resolve4/6` so we see exactly what puppeteer /
 * fetch will resolve. A `/etc/hosts` entry pointing evil.com -> 127.0.0.1
 * would otherwise bypass `resolve4`.
 */
export class SsrfError extends Error {
  readonly code = "SSRF_BLOCKED" as const;
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const MAX_URL_LENGTH = 2048;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** RFC1918 / loopback / link-local / CGNAT for IPv4. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1, 5).map((x) => Number(x));
  if (parts.some((n) => n > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** IPv6 loopback (::1), unspecified (::), link-local (fe80::/10), ULA (fc/fd). */
function isPrivateIpv6Native(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

/**
 * IPv4-mapped IPv6 addresses look like `::ffff:127.0.0.1` or
 * `::ffff:7f00:0001`. In both forms the trailing 32 bits encode an IPv4
 * address; reject if that IPv4 is private.
 */
function isMappedIpv4Private(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("::ffff:")) return false;

  const tail = lower.slice("::ffff:".length);

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
    return isPrivateIpv4(tail);
  }

  const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(dotted);
  }

  return false;
}

function isBlockedAddress(address: string, family: 4 | 6): boolean {
  if (family === 4) return isPrivateIpv4(address);
  return isPrivateIpv6Native(address) || isMappedIpv4Private(address);
}

/**
 * Validate a user-supplied URL is safe to fetch from the server. Throws
 * `SsrfError` (with a precise reason) if any check fails. Returns the parsed
 * `URL` so callers can use the canonicalised string directly.
 */
export async function assertSafeUrl(input: string): Promise<URL> {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new SsrfError("URL is required.");
  }

  if (input.length > MAX_URL_LENGTH) {
    throw new SsrfError(
      `URL exceeds maximum length of ${MAX_URL_LENGTH} characters.`,
    );
  }

  // Reject explicit non-http(s) schemes BEFORE handing off to validateScanUrl
  // (which silently prepends https:// to any unprefixed input, masking
  // file:/javascript:/data:/ftp: with a misleading DNS error).
  const explicitScheme = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/.exec(input.trim());
  if (explicitScheme) {
    const proto = `${explicitScheme[1].toLowerCase()}:`;
    if (!ALLOWED_SCHEMES.has(proto)) {
      throw new SsrfError(
        `Only http and https URLs are allowed (got ${proto}).`,
      );
    }
  }

  const basic = validateScanUrl(input);
  if (!basic.ok) {
    throw new SsrfError(basic.error);
  }

  const parsed = basic.parsed;

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new SsrfError(
      `Only http and https URLs are allowed (got ${parsed.protocol || "unknown"}).`,
    );
  }

  // Strip surrounding brackets from IPv6 hostnames so dns.lookup accepts them.
  let host = parsed.hostname;
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  // Direct IP literals were already screened by validateScanUrl, but the IPv6
  // path there is intentionally lightweight. Re-run mapped-IPv4 detection
  // against the literal host to catch `[::ffff:127.0.0.1]` style inputs.
  if (host.includes(":") && isMappedIpv4Private(host)) {
    throw new SsrfError(
      "URL targets an IPv4-mapped IPv6 address that resolves to a private network.",
    );
  }

  // Skip DNS lookup for direct IP literals (already validated above and by
  // validateScanUrl). Otherwise resolve through the OS resolver so /etc/hosts
  // entries are honoured.
  const isIpv4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6Literal = host.includes(":");

  if (!isIpv4Literal && !isIpv6Literal) {
    let addresses: LookupAddress[];
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      throw new SsrfError(`DNS lookup failed for hostname "${host}".`);
    }

    if (addresses.length === 0) {
      throw new SsrfError(`No DNS records found for hostname "${host}".`);
    }

    for (const { address, family } of addresses) {
      const fam = family === 4 || family === 6 ? family : 4;
      if (isBlockedAddress(address, fam)) {
        throw new SsrfError(
          `Hostname "${host}" resolves to a blocked address (${address}); refusing to scan.`,
        );
      }
    }
  }

  return parsed;
}
