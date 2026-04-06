/**
 * Strips common Markdown the model should not emit (headings, emphasis) while preserving
 * fenced code blocks and pipe tables. Used for on-screen AI explanation display.
 */
export function sanitizeExplanationForDisplay(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((chunk) => {
      if (chunk.startsWith("```")) return chunk;
      return chunk
        .split("\n")
        .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, ""))
        .join("\n")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
        .replace(/__([^_]+)__/g, "$1");
    })
    .join("");
}

/**
 * Pulls executive summary + suggestions for TTS / short briefings.
 */
export function extractProfessionalSummary(markdown: string): string {
  const execNew = markdown.match(
    /^Executive Summary\s*\n([\s\S]*?)(?=\nSection [0-9]|\n#{1,6}\s|$)/im,
  );
  if (execNew?.[1]?.trim()) {
    const body = sanitizeExplanationForDisplay(execNew[1].trim()).slice(0, 3200);
    const suggMatch =
      markdown.match(/Section 5 — Suggestions to Improve Further\s*\n([\s\S]*)/i)?.[1]?.slice(0, 1200) ??
      markdown.match(/##\s*(?:5\.?\s*)?Suggestions\s+to\s+improve[\s\S]*/i)?.[0]?.slice(0, 1200) ??
      "";
    const sugg = suggMatch ? sanitizeExplanationForDisplay(suggMatch.trim()) : "";
    return sugg ? `${body}\n\n${sugg}` : body;
  }

  const exec = markdown.match(/##\s*Executive\s*summary\s*([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i);
  if (exec?.[1]?.trim()) {
    const body = sanitizeExplanationForDisplay(exec[1].trim()).slice(0, 3200);
    const sugg =
      markdown.match(/##\s*(?:5\.?\s*)?Suggestions\s+to\s+improve[\s\S]*/i)?.[0]?.slice(0, 1200) ?? "";
    return sugg ? `${body}\n\n${sanitizeExplanationForDisplay(sugg)}` : body;
  }
  const suggOnly = markdown.match(/##\s*(?:5\.?\s*)?Suggestions\s+to\s+improve[\s\S]*/i);
  if (suggOnly) {
    return (
      sanitizeExplanationForDisplay(markdown.slice(0, 900).trim()) +
      "\n\n" +
      sanitizeExplanationForDisplay(suggOnly[0].slice(0, 1200))
    );
  }
  return sanitizeExplanationForDisplay(markdown.slice(0, 2500).trim());
}
