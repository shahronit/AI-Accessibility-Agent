"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isTableRow, parseMarkdownTableRows } from "@/lib/reportMdShared";

function formatLineSegment(key: string, line: string) {
  const t = line.trim();
  if (t === "Executive Summary" || /^Section \d+ — .+/.test(t)) {
    return (
      <p
        key={key}
        className="text-foreground mt-4 border-b border-white/10 pb-1.5 text-sm font-semibold tracking-tight first:mt-0"
      >
        {t}
      </p>
    );
  }
  if (t.startsWith("✅") || /^\[ADD\]/i.test(t)) {
    return (
      <span key={key} className="block border-l-4 border-green-600 bg-green-950/40 py-0.5 pl-2 text-green-100">
        {line}
      </span>
    );
  }
  if (t.startsWith("❌") || /^\[REMOVE\]/i.test(t)) {
    return (
      <span key={key} className="block border-l-4 border-red-600 bg-red-950/40 py-0.5 pl-2 text-red-100">
        {line}
      </span>
    );
  }
  return (
    <span key={key} className="block">
      {line || "\u00a0"}
    </span>
  );
}

function renderBlock(text: string, baseKey: string) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const cells = parseMarkdownTableRows(tableLines);
      if (cells.length === 0) continue;
      const header = cells[0];
      const body = cells.slice(1);
      out.push(
        <div key={`${baseKey}-t-${keyIdx++}`} className="my-3 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[280px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-muted/80">
                {header.map((h, j) => (
                  <th key={j} className="border-b px-2 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className="border-b border-border/60 last:border-0">
                  {row.map((c, ci) => (
                    <td key={ci} className="align-top px-2 py-1.5">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    out.push(formatLineSegment(`${baseKey}-l-${keyIdx++}`, line));
    i++;
  }
  return <div className="space-y-0.5 font-sans text-sm leading-relaxed">{out}</div>;
}

type Props = {
  text: string;
  className?: string;
};

/**
 * Renders AI markdown-ish text: fenced code, pipe tables, ✅/❌ lines.
 */
export function FormattedAiText({ text, className }: Props) {
  const nodes = useMemo(() => {
    const chunks = text.split(/(```[\s\S]*?```)/g);
    return chunks.map((chunk, i) => {
      if (chunk.startsWith("```")) {
        const m = chunk.match(/^```(\w*)\n?([\s\S]*?)```$/);
        const inner = m ? m[2] : chunk.replace(/^```|```$/g, "");
        return (
          <pre
            key={i}
            className="bg-muted my-2 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-snug"
          >
            {inner.trimEnd()}
          </pre>
        );
      }
      if (!chunk) return null;
      return (
        <Fragment key={i}>
          {renderBlock(chunk, `b${i}`)}
        </Fragment>
      );
    });
  }, [text]);

  return <div className={cn("text-foreground", className)}>{nodes}</div>;
}
