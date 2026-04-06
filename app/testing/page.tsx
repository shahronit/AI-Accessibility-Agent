import Link from "next/link";
import { ClipboardCheck, Layers, LayoutGrid, Workflow } from "lucide-react";
import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";
import { cn } from "@/lib/utils";

const cardClass =
  "group border-border/50 from-card/80 to-card/40 hover:border-primary/25 flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-colors hover:shadow-md";

export default function TestingOverviewPage() {
  return (
    <article className="space-y-10 pb-12">
      <TestingHero
        icon="layoutGrid"
        title="Accessibility testing hub"
        accentClass="from-violet-600/25 via-card/95 to-slate-950/45"
        subtitle="Each guide runs its own scan on the URL you enter, then builds a formatted report you can export as PDF."
      />

      <section aria-labelledby="guides-heading" className="space-y-4">
        <h2 id="guides-heading" className="text-foreground text-sm font-semibold tracking-wide uppercase">
          Focused reports
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/testing/pour" className={cn(cardClass)}>
            <span className="bg-primary/15 text-primary inline-flex size-10 items-center justify-center rounded-xl">
              <Layers className="size-5" aria-hidden />
            </span>
            <span className="text-foreground font-semibold">POUR</span>
            <span className="text-muted-foreground text-sm leading-snug">
              Perceivable, Operable, Understandable, Robust mapping.
            </span>
          </Link>
          <Link href="/testing/methods" className={cn(cardClass)}>
            <span className="bg-cyan-500/15 text-cyan-400 inline-flex size-10 items-center justify-center rounded-xl">
              <Workflow className="size-5" aria-hidden />
            </span>
            <span className="text-foreground font-semibold">Methods</span>
            <span className="text-muted-foreground text-sm leading-snug">
              Automated, manual, and user-testing plan.
            </span>
          </Link>
          <Link href="/testing/checkpoints" className={cn(cardClass)}>
            <span className="bg-emerald-500/15 text-emerald-400 inline-flex size-10 items-center justify-center rounded-xl">
              <ClipboardCheck className="size-5" aria-hidden />
            </span>
            <span className="text-foreground font-semibold">Checkpoints</span>
            <span className="text-muted-foreground text-sm leading-snug">
              Keyboard, contrast, alt text, forms.
            </span>
          </Link>
        </div>
      </section>

      <TestingAgentRunner
        mode="comprehensive"
        icon="sparkles"
        fieldId="testing-overview-url"
        title="Full combined report"
        cardAccent="from-violet-500/10 via-card to-slate-950/35"
      />
    </article>
  );
}
