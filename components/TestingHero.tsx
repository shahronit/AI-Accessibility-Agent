import { ClipboardCheck, Layers, LayoutGrid, Sparkles, Workflow, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const HERO_ICONS = {
  layoutGrid: LayoutGrid,
  layers: Layers,
  workflow: Workflow,
  clipboardCheck: ClipboardCheck,
  sparkles: Sparkles,
} as const satisfies Record<string, LucideIcon>;

export type TestingHeroIconKey = keyof typeof HERO_ICONS;

type Props = {
  icon: TestingHeroIconKey;
  title: string;
  subtitle: string;
  /** Tailwind gradient stops, e.g. `from-indigo-600/25 via-card/90 to-violet-950/30` */
  accentClass: string;
};

export function TestingHero({ icon, title, subtitle, accentClass }: Props) {
  const Icon = HERO_ICONS[icon];
  return (
    <header
      className={cn(
        "relative mb-10 overflow-hidden rounded-2xl border border-white/10 p-7 shadow-lg sm:p-9",
        "bg-gradient-to-br",
        accentClass,
      )}
    >
      <div
        className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-violet-500/15 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="border-border/40 flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-black/25 shadow-inner backdrop-blur-sm sm:size-16">
          <Icon className="text-primary size-7 sm:size-8" aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}
