import { EssentialChecksRunner } from "@/components/EssentialChecksRunner";
import { TestingHero } from "@/components/TestingHero";

export default function TestingCheckpointsPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="clipboardCheck"
        title="Essential checks"
        accentClass="from-emerald-600/22 via-card/95 to-slate-950/45"
        subtitle="Run a scan to see an at-a-glance report: severity breakdown, passing rules, items that need manual review, and copy-ready Jira titles for each finding."
      />

      <EssentialChecksRunner fieldId="testing-checkpoints-url" />
    </article>
  );
}
