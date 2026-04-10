"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getScanMethodologyLayers,
  type ScanMethodologyContext,
  type ScanMethodologyTier,
} from "@/lib/scanMethodology";
import { cn } from "@/lib/utils";

const TIER_BADGE: Record<ScanMethodologyTier, string> = {
  manual: "border-violet-500/35 bg-violet-500/10 text-violet-200",
  partial: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  automated: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
};

type Props = {
  context: ScanMethodologyContext;
  /** Tighter copy and spacing for embedded runners (e.g. Essential checks). */
  variant?: "default" | "compact";
  className?: string;
};

export function ScanMethodologyPanel({ context, variant = "default", className }: Props) {
  const layers = getScanMethodologyLayers(context);
  const compact = variant === "compact";

  return (
    <details
      open
      className={cn(
        "group border-border/50 rounded-xl border border-white/[0.07] bg-black/20",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <summary
        className={cn(
          "text-foreground flex cursor-pointer list-none items-center justify-between gap-2 font-medium tracking-tight outline-none select-none [&::-webkit-details-marker]:hidden",
          compact ? "px-3 py-2.5" : "px-4 py-3",
        )}
      >
        <span>How this scan maps to your testing practice</span>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className={cn("border-t border-white/[0.06]", compact ? "space-y-2.5 px-3 pb-3 pt-2" : "space-y-3 px-4 pb-4 pt-2")}>
        <p className="text-muted-foreground leading-relaxed">
          Four common layers—from real assistive-tech use down to static rules. This app is strongest on the rule-based
          layer; the rows below show what is manual, partial, or fully automated here.
        </p>
        <ul className="space-y-2.5">
          {layers.map(({ id, title, tier, tierLabel, description, Icon }) => (
            <li
              key={id}
              className={cn(
                "border-border/40 flex gap-3 rounded-lg border border-white/[0.05] bg-zinc-950/40",
                compact ? "p-2.5" : "p-3",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/40 text-zinc-300",
                  compact && "size-7",
                )}
              >
                <Icon className={cn(compact ? "size-3.5" : "size-4")} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <p className={cn("font-medium text-zinc-100", compact ? "text-xs" : "text-sm")}>{title}</p>
                  <Badge variant="outline" className={cn("text-[10px] font-normal", TIER_BADGE[tier])}>
                    {tierLabel}
                  </Badge>
                </div>
                <p className={cn("text-muted-foreground mt-1.5 leading-relaxed", compact ? "text-[11px]" : "text-xs")}>
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
