import { TestingAgentRunner } from "@/components/TestingAgentRunner";
import { TestingHero } from "@/components/TestingHero";

export default function AiReportAnalysisPage() {
  return (
    <article className="space-y-8 pb-12">
      <TestingHero
        icon="sparkles"
        title="AI report Analysis"
        accentClass="from-violet-600/25 via-card/95 to-slate-950/45"
        subtitle="Enter any website address, run an automated accessibility check, and get one combined AI report in everyday language—with fixes you can download as a PDF."
      />

      <TestingAgentRunner
        mode="comprehensive"
        icon="sparkles"
        fieldId="testing-ai-report-url"
        title="Full combined report"
        cardAccent="from-violet-500/10 via-card to-slate-950/35"
      />
    </article>
  );
}
