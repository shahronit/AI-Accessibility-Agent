import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingCheckpointsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="clipboardCheck"
        title="Essential checks"
        accentClass="from-emerald-600/22 via-card/95 to-slate-950/45"
        subtitle="Scan a URL to group findings by keyboard use, text contrast, image text, and form labels."
      />

      <TestingAgentRunner
        mode="checkpoints"
        icon="clipboardCheck"
        fieldId="testing-checkpoints-url"
        title="Essential checks report"
        cardAccent="from-emerald-500/10 via-card to-slate-950/40"
      />
    </article>
  );
}
