import { ExpertAuditRunner } from "@/components/ExpertAuditRunner";
import { TestingHero } from "@/components/TestingHero";

export default function ExpertAuditPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="clipboardCheck"
        title="Expert WCAG audit"
        accentClass="from-rose-600/25 via-card/95 to-slate-950/45"
        subtitle="Senior-QA / CPACC-style audit across WCAG 2.1 & 2.2 AA (and the new 2.4.11, 2.5.3, 3.2.6, 3.3.7). Severity ratings, before/after fix code, technique IDs, and exportable Markdown / JSON / Jira-ready output."
      />

      <ExpertAuditRunner fieldId="testing-expert-url" />
    </article>
  );
}
