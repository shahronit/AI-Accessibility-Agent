import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingPourPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="layers"
        title="POUR analysis"
        accentClass="from-indigo-600/28 via-card/95 to-violet-950/40"
        subtitle="Scan a URL for a pillar-by-pillar WCAG POUR report."
      />

      <TestingAgentRunner
        mode="pour"
        icon="layers"
        fieldId="testing-pour-url"
        title="WCAG POUR report"
        cardAccent="from-indigo-500/12 via-card to-violet-950/45"
      />
    </article>
  );
}
