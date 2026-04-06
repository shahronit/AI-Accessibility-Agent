/** Shared helpers for markdown-style AI report rendering (tables, etc.). */

export function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1) && t.length > 2;
}

export function isSeparatorRow(line: string): boolean {
  return /^\|?[\s\-:|]+\|?$/.test(line.trim());
}

export function parseMarkdownTableRows(rows: string[]): string[][] {
  return rows
    .filter((r) => !isSeparatorRow(r))
    .map((r) =>
      r
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim()),
    );
}
