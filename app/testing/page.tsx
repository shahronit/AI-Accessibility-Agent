import Link from "next/link";
import { ClipboardCheck, ClipboardList, Layers, Sparkles, Workflow } from "lucide-react";
import { TestingHero } from "@/components/TestingHero";
import { cn } from "@/lib/utils";

const cardClass =
  "group border-border/50 from-card/80 to-card/40 hover:border-primary/25 flex flex-col gap-3 rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-colors hover:shadow-md";

const quickLinks = [
  {
    href: "/testing/ai-report",
    title: "AI report Analysis",
    description:
      "Paste a link, scan the page, and read one clear AI write-up of everything that was flagged.",
    icon: Sparkles,
    iconWrap: "bg-violet-500/15 text-violet-300",
  },
  {
    href: "/testing/scenarios",
    title: "Testing Scenarios",
    description:
      "Build manual tests from your last scan, pick which cases to include, and create one Jira Test issue (Xray/Zephyr-friendly).",
    icon: ClipboardList,
    iconWrap: "bg-amber-500/15 text-amber-400",
  },
  {
    href: "/testing/checkpoints",
    title: "Essential checks",
    description:
      "Severity breakdown, passing rules, items that need manual review, and copy-ready Jira titles for each finding.",
    icon: ClipboardCheck,
    iconWrap: "bg-emerald-500/15 text-emerald-400",
  },
  {
    href: "/testing/pour",
    title: "Core principles",
    description:
      "Perceive, operate, understand, robust—issues grouped with guideline references when helpful.",
    icon: Layers,
    iconWrap: "bg-indigo-500/15 text-indigo-300",
  },
  {
    href: "/testing/methods",
    title: "Testing plan",
    description:
      "What automation covered, what to verify yourself or with a screen reader, and ideas for testing with real people.",
    icon: Workflow,
    iconWrap: "bg-cyan-500/15 text-cyan-300",
  },
] as const;

export default function AiTestingDashboardPage() {
  return (
    <article className="space-y-10 pb-12">
      <TestingHero
        icon="layoutGrid"
        title="AI Testing Dashboard"
        accentClass="from-violet-600/25 via-card/95 to-slate-950/45"
        subtitle="Turn scan results into plain-language AI reports and hands-on test ideas, aligned with common accessibility standards (including what many government sites follow). Run New scan first when a flow needs your latest scan session."
      />

      <section aria-labelledby="guides-heading" className="space-y-4">
        <h2 id="guides-heading" className="text-foreground text-sm font-semibold tracking-wide uppercase">
          Quick links
        </h2>
        <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          All smart testing tools are listed here. Use the sidebar &quot;Testing hub&quot; link anytime to return to this
          page.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map(({ href, title, description, icon: Icon, iconWrap }) => (
            <Link key={href} href={href} className={cn(cardClass)}>
              <span
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-xl",
                  iconWrap,
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-foreground font-semibold">{title}</span>
              <span className="text-muted-foreground text-sm leading-snug">{description}</span>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
