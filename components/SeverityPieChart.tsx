"use client";

import type { ImpactLevel } from "@/lib/axeScanner";
import { cn } from "@/lib/utils";

const ORDER: ImpactLevel[] = ["critical", "serious", "moderate", "minor"];

const FILL: Record<ImpactLevel, string> = {
  critical: "#f87171",
  serious: "#fb923c",
  moderate: "#fbbf24",
  minor: "#34d399",
};

function slicePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

type Props = {
  byImpact: Record<string, number>;
  selected: ImpactLevel | "all";
  onSelect: (level: ImpactLevel | "all") => void;
  className?: string;
};

/**
 * Clickable SVG pie chart by severity. Click again on the active slice to show all.
 */
export function SeverityPieChart({ byImpact, selected, onSelect, className }: Props) {
  const segments = ORDER.map((level) => ({ level, count: byImpact[level] ?? 0 })).filter((s) => s.count > 0);
  const total = segments.reduce((a, s) => a + s.count, 0);

  if (total === 0) {
    return (
      <div
        className={cn(
          "flex h-[220px] w-full max-w-[220px] items-center justify-center rounded-full border border-white/10 bg-black/30 text-center text-xs text-zinc-500",
          className,
        )}
        role="img"
        aria-label="No violations to chart"
      >
        No violations
      </div>
    );
  }

  const cx = 100;
  const cy = 100;
  const r = 88;
  const sliceGeometry = segments.reduce<
    { level: ImpactLevel; count: number; a0: number; a1: number; sweep: number }[]
  >((acc, { level, count }) => {
    const sweep = (count / total) * 2 * Math.PI;
    const a0 = acc.length === 0 ? -Math.PI / 2 : acc[acc.length - 1].a1;
    acc.push({ level, count, a0, a1: a0 + sweep, sweep });
    return acc;
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8", className)}>
      <svg
        viewBox="0 0 200 200"
        className="h-[220px] w-[220px] shrink-0"
        role="img"
        aria-label="Violations by severity. Click a slice to filter the list below."
      >
        <title>Violations by severity</title>
        {sliceGeometry.map(({ level, count, a0, a1, sweep }) => {
          const isActive = selected === "all" || selected === level;
          const dim = selected !== "all" && selected !== level;
          const d = slicePath(cx, cy, r, a0, a1);
          const mid = (a0 + a1) / 2;
          const lx = cx + (r * 0.62) * Math.cos(mid);
          const ly = cy + (r * 0.62) * Math.sin(mid);
          return (
            <g key={level}>
              <path
                d={d}
                fill={FILL[level]}
                opacity={dim ? 0.28 : 0.95}
                className="cursor-pointer transition-[opacity,filter] duration-150 hover:brightness-110 focus:outline-none"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={isActive && selected !== "all" ? 2 : 1}
                tabIndex={0}
                role="button"
                aria-pressed={selected === level}
                aria-label={`${level}: ${count} issue${count === 1 ? "" : "s"}. ${selected === level ? "Active filter. Press to show all." : "Filter list to this severity."}`}
                onClick={() => onSelect(selected === level ? "all" : level)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(selected === level ? "all" : level);
                  }
                }}
              />
              {sweep > 0.25 && count >= 1 ? (
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none fill-zinc-950 text-[11px] font-bold tabular-nums"
                >
                  {count}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <ul className="flex w-full min-w-0 flex-col gap-2 text-sm" aria-label="Severity legend">
        {ORDER.map((level) => {
          const count = byImpact[level] ?? 0;
          if (count === 0) return null;
          const active = selected === level;
          return (
            <li key={level}>
              <button
                type="button"
                onClick={() => onSelect(active ? "all" : level)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-emerald-500/50 bg-emerald-500/15"
                    : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-black/40",
                )}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: FILL[level] }}
                    aria-hidden
                  />
                  <span className="capitalize text-zinc-200">{level}</span>
                </span>
                <span className="tabular-nums text-zinc-400">{count}</span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => onSelect("all")}
            className={cn(
              "mt-1 w-full rounded-lg border px-3 py-2 text-xs transition-colors",
              selected === "all"
                ? "border-zinc-500/50 bg-zinc-500/10 text-zinc-200"
                : "border-white/10 text-zinc-500 hover:text-zinc-300",
            )}
          >
            Show all severities
          </button>
        </li>
      </ul>
    </div>
  );
}
