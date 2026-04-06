/**
 * Remove duplicate paragraphs from model output (same normalized text).
 * Skips fenced ``` blocks so code/tables inside fences stay intact.
 */
export function dedupeReportParagraphs(raw: string): string {
  const parts = raw.split(/(```[\s\S]*?```)/g);
  return parts
    .map((chunk, i) => {
      if (chunk.startsWith("```")) return chunk;
      const paras = chunk.split(/\n\n+/);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const p of paras) {
        const t = p.trim();
        if (t.length === 0) continue;
        const norm = t.replace(/\s+/g, " ").toLowerCase();
        if (norm.length >= 24 && seen.has(norm)) continue;
        if (norm.length >= 24) seen.add(norm);
        out.push(p.trimEnd());
      }
      return out.join("\n\n");
    })
    .join("");
}
