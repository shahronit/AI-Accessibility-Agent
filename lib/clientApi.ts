"use client";

export { sanitizeIssueForApi } from "@/lib/issueSanitize";

type JsonRecord = Record<string, unknown>;

/**
 * POST JSON to a same-origin API route with clear errors when the dev server
 * is unreachable (browser reports "Failed to fetch").
 */
export async function postAppJson<T extends JsonRecord>(
  path: string,
  body: unknown,
  init?: { timeoutMs?: number },
): Promise<T> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${path}`;
  const timeoutMs = init?.timeoutMs ?? 120_000;
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ac.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new Error(
      aborted
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s. The AI service may be slow—try again.`
        : "Network error: could not reach this app. Make sure `npm run dev` is running, open http://localhost:3000 (not an old tab), disable VPN/ad-block for localhost, then reload.",
    );
  } finally {
    window.clearTimeout(timer);
  }

  const raw = await res.text();
  let data: JsonRecord = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as JsonRecord;
    } catch {
      throw new Error(
        `Invalid response from server (${res.status}). The dev server may have restarted during the request—try Explain again.`,
      );
    }
  }

  if (!res.ok) {
    const err = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new Error(err);
  }

  return data as T;
}
