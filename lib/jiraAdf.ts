/** Minimal Atlassian Document Format for Jira Cloud REST issue descriptions. */

export function plainTextToAdf(text: string): {
  type: "doc";
  version: 1;
  content: Array<{ type: string; content?: unknown[] }>;
} {
  const chunks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const paragraphs =
    chunks.length > 0
      ? chunks.map((chunk) => ({
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: chunk.slice(0, 8000),
            },
          ],
        }))
      : [
          {
            type: "paragraph" as const,
            content: [{ type: "text" as const, text: "(No description)" }],
          },
        ];
  return { type: "doc", version: 1, content: paragraphs };
}
