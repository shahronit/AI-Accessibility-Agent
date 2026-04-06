import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingMethodsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="workflow"
        title="Testing plan"
        accentClass="from-cyan-600/22 via-card/95 to-slate-950/45"
        subtitle="Scan a page and get a practical plan: what the automatic check already covered, what to verify yourself or with a screen reader, and simple ideas for testing with real people."
      />

      <TestingAgentRunner
        mode="methods"
        icon="workflow"
        fieldId="testing-methods-url"
        title="Testing plan report"
        cardAccent="from-cyan-500/10 via-card to-slate-950/40"
      />
    </article>
  );
}
