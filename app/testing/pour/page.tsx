import { Layers } from "lucide-react";
import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingPourPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon={Layers}
        title="POUR analysis"
        accentClass="from-indigo-600/28 via-card/95 to-violet-950/40"
        subtitle="Scan a URL here to get a pillar-by-pillar view: tables and narrative tailored to Perceivable, Operable, Understandable, and Robust—with a distinct closing priority list."
      />

      <TestingAgentRunner
        mode="pour"
        icon={Layers}
        fieldId="testing-pour-url"
        title="WCAG POUR report"
        description="Axe results for this URL only. The model groups every finding under the right pillar, avoids repeating the same fix text across sections, and ends with Priority items to address."
        cardAccent="from-indigo-500/12 via-card to-violet-950/45"
      />
    </article>
  );
}
