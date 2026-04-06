import { Workflow } from "lucide-react";
import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingMethodsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon={Workflow}
        title="Testing methods"
        accentClass="from-cyan-600/22 via-card/95 to-slate-950/45"
        subtitle="Run a dedicated scan, then receive a layered plan: what automation already proved, what experts should verify with assistive tech, and what to validate with participants—each layer adds new detail, not copy-paste."
      />

      <TestingAgentRunner
        mode="methods"
        icon={Workflow}
        fieldId="testing-methods-url"
        title="Methods report"
        description="Built from this page’s scan only. Sections stay unique: automation summary, manual checklist, user-study ideas, timeline—plus numbered priorities that do not duplicate earlier bullets."
        cardAccent="from-cyan-500/10 via-card to-slate-950/40"
      />
    </article>
  );
}
