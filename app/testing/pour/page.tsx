import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingPourPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="layers"
        title="Core principles"
        accentClass="from-indigo-600/28 via-card/95 to-violet-950/40"
        subtitle="Scan a URL to see how each issue fits the four accessibility ideas: perceivable, operable, understandable, and robust."
      />

      <TestingAgentRunner
        mode="pour"
        icon="layers"
        fieldId="testing-pour-url"
        title="Core principles report"
        cardAccent="from-indigo-500/12 via-card to-violet-950/45"
      />
    </article>
  );
}
