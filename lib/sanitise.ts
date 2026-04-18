import DOMPurify from "isomorphic-dompurify";

/**
 * Strip any HTML tags / event handlers / `javascript:` URLs from untrusted
 * strings before they leave a server route.
 *
 * The AI providers (Anthropic, Gemini, AssemblyAI Gateway) return Markdown,
 * not HTML. DOMPurify leaves Markdown literals like `**bold**`, `# Heading`,
 * and fenced code blocks untouched because they are not parsed as HTML, but
 * it removes literal `<script>`, `<iframe>`, `onerror=...`, and
 * `javascript:` payloads if a model ever emits them. This keeps us safe if
 * the UI ever adopts a markdown-to-HTML renderer with `dangerouslySetInnerHTML`.
 *
 * `isomorphic-dompurify` provides a JSDOM-backed sanitizer that works in
 * Node (Vercel / Render serverless functions) and browsers from the same
 * import.
 */
export function sanitiseHtml(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  return DOMPurify.sanitize(input, { USE_PROFILES: { html: true } });
}

/** Alias kept for self-documenting call sites in API routes. */
export function sanitiseAiString(input: string): string {
  return sanitiseHtml(input);
}
