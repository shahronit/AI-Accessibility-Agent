/**
 * Pulls executive summary + suggestions for TTS / short briefings.
 */
export function extractProfessionalSummary(markdown: string): string {
  const exec = markdown.match(/##\s*Executive\s*summary\s*([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i);
  if (exec?.[1]?.trim()) {
    const body = exec[1].trim().slice(0, 3200);
    const sugg =
      markdown.match(/##\s*(?:5\.?\s*)?Suggestions\s+to\s+improve[\s\S]*/i)?.[0]?.slice(0, 1200) ?? "";
    return sugg ? `${body}\n\n${sugg}` : body;
  }
  const suggOnly = markdown.match(/##\s*(?:5\.?\s*)?Suggestions\s+to\s+improve[\s\S]*/i);
  if (suggOnly) {
    return markdown.slice(0, 900).trim() + "\n\n" + suggOnly[0].slice(0, 1200);
  }
  return markdown.slice(0, 2500).trim();
}
