import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingMethodsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="workflow"
        title="Testing methods"
        accentClass="from-cyan-600/22 via-card/95 to-slate-950/45"
        subtitle="Scan a URL for an automated → manual → user-testing plan based on the findings."
      />

      <TestingAgentRunner
        mode="methods"
        icon="workflow"
        fieldId="testing-methods-url"
        title="Methods report"
        cardAccent="from-cyan-500/10 via-card to-slate-950/40"
      />
    </article>
  );
}
