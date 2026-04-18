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

export type StreamResult = {
  /** Resolved provider model id, e.g. "claude-sonnet-4-5". */
  model: string | null;
  /** Echoed `outputFormat` from the route (markdown / json / jira). */
  outputFormat: string | null;
  /** Full text accumulated across all chunks. */
  full: string;
  /** True if the stream was aborted by the client (timeout or user cancel). */
  aborted: boolean;
};

/**
 * POST a JSON body and stream the plain-text response back chunk-by-chunk via
 * `onText`. Used for long-running AI report endpoints (`expert-audit`,
 * `comprehensive`) that emit incremental markdown.
 *
 * Resolves once the stream closes; throws with the same error-message
 * conventions as `postAppJson`. If the server returns a non-2xx (rate-limit,
 * validation, auth), the body is parsed as JSON and `error` is surfaced so
 * callers don't need a separate failure path.
 */
export async function postAppStream(
  path: string,
  body: unknown,
  init: {
    onText: (delta: string) => void;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<StreamResult> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${path}`;
  const timeoutMs = init.timeoutMs ?? 120_000;
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), timeoutMs);

  // If the caller passed in an external signal (e.g. component unmount),
  // forward its abort to our internal controller so the fetch + reader both
  // tear down together.
  if (init.signal) {
    if (init.signal.aborted) ac.abort();
    else init.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/plain" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ac.signal,
    });
  } catch (e) {
    window.clearTimeout(timer);
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new Error(
      aborted
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s. The AI service may be slow—try again.`
        : "Network error: could not reach this app. Make sure `npm run dev` is running, open http://localhost:3000 (not an old tab), disable VPN/ad-block for localhost, then reload.",
    );
  }

  if (!res.ok) {
    window.clearTimeout(timer);
    const raw = await res.text().catch(() => "");
    let errMsg = `Request failed (${res.status})`;
    if (raw) {
      try {
        const data = JSON.parse(raw) as { error?: unknown };
        if (typeof data.error === "string" && data.error.trim()) {
          errMsg = data.error;
        }
      } catch {
        // non-JSON error body — keep the generic message
      }
    }
    throw new Error(errMsg);
  }

  if (!res.body) {
    window.clearTimeout(timer);
    throw new Error("Streaming response has no body — your browser may not support fetch streams.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let aborted = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          full += chunk;
          init.onText(chunk);
        }
      }
    }
    const tail = decoder.decode();
    if (tail) {
      full += tail;
      init.onText(tail);
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      aborted = true;
    } else {
      window.clearTimeout(timer);
      throw e;
    }
  } finally {
    window.clearTimeout(timer);
  }

  return {
    model: res.headers.get("X-AI-Model"),
    outputFormat: res.headers.get("X-AI-Output-Format"),
    full,
    aborted,
  };
}
