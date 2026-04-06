import { ClipboardCheck } from "lucide-react";
import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingCheckpointsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon={ClipboardCheck}
        title="Key checkpoints"
        accentClass="from-emerald-600/22 via-card/95 to-slate-950/45"
        subtitle="Scan a URL to align findings with keyboard, contrast, alternative text, and forms. Each finding is placed in one checkpoint bucket so the UI stays free of duplicate rows."
      />

      <TestingAgentRunner
        mode="checkpoints"
        icon={ClipboardCheck}
        fieldId="testing-checkpoints-url"
        title="Checkpoint report"
        description="Uses the scan you run on this page. Tables and lists are rendered as styled content—no visible # or list asterisks. The model assigns each violation to a single best-fit checkpoint when possible."
        cardAccent="from-emerald-500/10 via-card to-slate-950/40"
      />
    </article>
  );
}
