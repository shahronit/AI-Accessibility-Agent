import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingMethodsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="workflow"
        title="Testing plan"
        accentClass="from-cyan-600/22 via-card/95 to-slate-950/45"
        subtitle="Scan a URL for a step-by-step plan: what the automated scan covered, what experts should check, and what to validate with real users."
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
