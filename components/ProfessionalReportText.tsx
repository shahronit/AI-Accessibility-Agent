"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dedupeReportParagraphs } from "@/lib/dedupeReportText";
import { isSeparatorRow, isTableRow, parseMarkdownTableRows } from "@/lib/reportMdShared";

/** Bold, italic, inline code — markdown markers are not left visible. */
function formatInline(text: string, keyPrefix: string): ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {segments.map((seg, i) => {
        const k = `${keyPrefix}-${i}`;
        if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
          return (
            <strong key={k} className="font-semibold text-foreground">
              {seg.slice(2, -2)}
            </strong>
          );
        }
        if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
          return (
            <code
              key={k}
              className="bg-muted/80 text-foreground/95 rounded px-1.5 py-0.5 font-mono text-[0.85em]"
            >
              {seg.slice(1, -1)}
            </code>
          );
        }
        const italicParts = seg.split(/(\*[^*]+\*)/g);
        return (
          <Fragment key={k}>
            {italicParts.map((ip, j) => {
              const ik = `${k}-em-${j}`;
              if (ip.length >= 2 && ip.startsWith("*") && ip.endsWith("*")) {
                return (
                  <em key={ik} className="text-foreground/95 italic">
                    {ip.slice(1, -1)}
                  </em>
                );
              }
              return <Fragment key={ik}>{ip}</Fragment>;
            })}
          </Fragment>
        );
      })}
    </>
  );
}

function renderTableRows(tableLines: string[], baseKey: string) {
  const cells = parseMarkdownTableRows(tableLines);
  if (cells.length === 0) return null;
  const header = cells[0];
  const body = cells.slice(1);
  return (
    <div
      key={baseKey}
      className="border-border/70 bg-card/40 my-5 overflow-x-auto rounded-xl border shadow-sm"
    >
      <table className="w-full min-w-[320px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border/60">
            {header.map((h, j) => (
              <th key={j} className="text-foreground px-4 py-3 text-xs font-semibold tracking-wide uppercase">
                {formatInline(h, `${baseKey}-h-${j}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-border/50 border-b last:border-0">
              {row.map((c, ci) => (
                <td key={ci} className="text-foreground/90 align-top px-4 py-3 leading-relaxed">
                  {formatInline(c, `${baseKey}-c-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LineKind =
  | { kind: "blank" }
  | { kind: "heading"; level: 2 | 3 | 4; text: string }
  | { kind: "rule" }
  | { kind: "table"; lines: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "callout"; tone: "positive" | "negative"; text: string }
  | { kind: "text"; text: string };

function classifyLine(line: string): LineKind {
  const t = line.trim();
  if (!t) return { kind: "blank" };
  if (/^[-*_]{3,}\s*$/.test(t)) return { kind: "rule" };
  const hm = t.match(/^(#{1,6})\s+(.+?)(?:\s+#*)?$/);
  if (hm) {
    const n = hm[1].length;
    const level = (n <= 2 ? 2 : n === 3 ? 3 : 4) as 2 | 3 | 4;
    return { kind: "heading", level, text: hm[2].trim() };
  }
  if (isTableRow(line)) return { kind: "text", text: t };
  if (/^\d+\.\s+/.test(t)) return { kind: "text", text: t };
  if (/^[-*]\s+/.test(t) && !t.startsWith("**")) return { kind: "text", text: t };
  if (t.startsWith("✅")) return { kind: "callout", tone: "positive", text: t };
  if (t.startsWith("❌")) return { kind: "callout", tone: "negative", text: t };
  return { kind: "text", text: t };
}

function linesToStructured(lines: string[]): LineKind[] {
  const out: LineKind[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push({ kind: "table", lines: tableLines });
      continue;
    }

    const t = line.trim();
    if (/^\d+\.\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^\d+\.\s+/.test(lt)) {
          items.push(lt.replace(/^\d+\.\s+/, ""));
          i++;
        } else break;
      }
      out.push({ kind: "ol", items });
      continue;
    }

    if (/^[-*]\s+/.test(t) && !t.startsWith("**")) {
      const items: string[] = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (/^[-*]\s+/.test(lt) && !lt.startsWith("**")) {
          items.push(lt.replace(/^[-*]\s+/, ""));
          i++;
        } else break;
      }
      out.push({ kind: "ul", items });
      continue;
    }

    out.push(classifyLine(line));
    i++;
  }
  return out;
}

function mergeTextLines(structured: LineKind[]): LineKind[] {
  const out: LineKind[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    out.push({ kind: "text", text: buf.join(" ") });
    buf = [];
  };
  for (const item of structured) {
    if (item.kind === "text") {
      buf.push(item.text);
      continue;
    }
    if (item.kind === "blank") {
      flush();
      continue;
    }
    flush();
    out.push(item);
  }
  flush();
  return out;
}

function renderStructured(structured: LineKind[], keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let k = 0;
  for (const item of structured) {
    const key = `${keyBase}-${k++}`;
    switch (item.kind) {
      case "blank":
        break;
      case "rule":
        nodes.push(<hr key={key} className="border-border/40 my-6" />);
        break;
      case "heading":
        if (item.level === 2) {
          nodes.push(
            <h2
              key={key}
              className="text-foreground mt-10 mb-4 border-b border-border/30 pb-2 text-lg font-semibold tracking-tight first:mt-0"
            >
              {formatInline(item.text, `${key}-t`)}
            </h2>,
          );
        } else if (item.level === 3) {
          nodes.push(
            <h3 key={key} className="text-foreground mt-8 mb-3 text-base font-semibold">
              {formatInline(item.text, `${key}-t`)}
            </h3>,
          );
        } else {
          nodes.push(
            <h4 key={key} className="text-foreground/95 mt-6 mb-2 text-sm font-semibold">
              {formatInline(item.text, `${key}-t`)}
            </h4>,
          );
        }
        break;
      case "table": {
        const tbl = renderTableRows(item.lines.filter((l) => !isSeparatorRow(l)), key);
        if (tbl) nodes.push(tbl);
        break;
      }
      case "ol":
        nodes.push(
          <ol key={key} className="text-foreground/90 my-4 list-decimal space-y-2 pl-6 text-sm leading-relaxed">
            {item.items.map((it, j) => (
              <li key={j}>{formatInline(it, `${key}-li-${j}`)}</li>
            ))}
          </ol>,
        );
        break;
      case "ul":
        nodes.push(
          <ul key={key} className="text-foreground/90 my-4 list-disc space-y-2 pl-6 text-sm leading-relaxed">
            {item.items.map((it, j) => (
              <li key={j}>{formatInline(it, `${key}-li-${j}`)}</li>
            ))}
          </ul>,
        );
        break;
      case "callout":
        nodes.push(
          <div
            key={key}
            className={cn(
              "my-4 rounded-lg border px-4 py-3 text-sm leading-relaxed",
              item.tone === "positive"
                ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-50"
                : "border-red-500/35 bg-red-950/25 text-red-50",
            )}
          >
            {formatInline(item.text, `${key}-c`)}
          </div>,
        );
        break;
      case "text":
        nodes.push(
          <p key={key} className="text-foreground/90 my-4 text-sm leading-relaxed first:mt-0">
            {formatInline(item.text, `${key}-p`)}
          </p>,
        );
        break;
      default:
        break;
    }
  }
  return nodes;
}

function renderChunk(chunk: string, idx: number): ReactNode {
  const lines = chunk.split("\n");
  const structured = mergeTextLines(linesToStructured(lines));
  return <div key={idx}>{renderStructured(structured, `c${idx}`)}</div>;
}

type Props = {
  text: string;
  className?: string;
  /** Remove duplicate paragraphs (model repetition). Default true. */
  dedupe?: boolean;
};

/**
 * Renders AI reports: headings, paragraphs, lists, and pipe tables without showing raw # or list markers.
 */
export function ProfessionalReportText({ text, className, dedupe = true }: Props) {
  const nodes = useMemo(() => {
    const cleaned = dedupe ? dedupeReportParagraphs(text.trim()) : text.trim();
    const chunks = cleaned.split(/(```[\s\S]*?```)/g);
    return chunks.map((chunk, i) => {
      if (chunk.startsWith("```")) {
        const m = chunk.match(/^```(\w*)\n?([\s\S]*?)```$/);
        const inner = m ? m[2] : chunk.replace(/^```|```$/g, "");
        return (
          <pre
            key={i}
            className="border-border/60 bg-muted/40 my-5 overflow-x-auto rounded-xl border p-4 font-mono text-xs leading-relaxed"
          >
            {inner.trimEnd()}
          </pre>
        );
      }
      if (!chunk.trim()) return null;
      return renderChunk(chunk, i);
    });
  }, [text, dedupe]);

  return <div className={cn("professional-report text-foreground", className)}>{nodes}</div>;
}
