import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingCheckpointsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="clipboardCheck"
        title="Key checkpoints"
        accentClass="from-emerald-600/22 via-card/95 to-slate-950/45"
        subtitle="Scan a URL to bucket findings under keyboard, contrast, alt text, and forms."
      />

      <TestingAgentRunner
        mode="checkpoints"
        icon="clipboardCheck"
        fieldId="testing-checkpoints-url"
        title="Checkpoint report"
        cardAccent="from-emerald-500/10 via-card to-slate-950/40"
      />
    </article>
  );
}
