import type { ScanIssue } from "@/lib/axeScanner";
import { issuesPayloadCompact } from "@/lib/manualTestScenario";
import { TESTING_NORMS_MANUAL_SCENARIOS } from "@/lib/testingNorms";
import { encodeStructuredForLlm, FINDINGS_TOON_HEADER } from "@/lib/toonEncode";

const SYSTEM = `You are a senior accessibility QA engineer. You write **manual** test cases for human testers (not automation scripts).

${TESTING_NORMS_MANUAL_SCENARIOS}

When scan findings are attached, they use **TOON** (Token-Oriented Object Notation) for token efficiency—not JSON. Read headers and rows the same way you would structured JSON rows.

Respond with **only** a single JSON object (no markdown code fences, no commentary before or after). Use this exact shape:
{"testCases":[{"testScenario":"string","testCaseTitle":"string","steps":"string","actualResult":"string","expectedResult":"string"}]}

Rules:
- Produce **8–18** distinct test cases covering the scan findings and important WCAG areas for the page (keyboard, contrast, zoom/reflow, forms, images, headings, focus, ARIA, predictable behavior, errors where relevant).
- **testScenario**: short area label (e.g. "Keyboard navigation", "Color contrast").
- **testCaseTitle**: specific, actionable title.
- **steps**: numbered lines (1. 2. 3.) plain text, suitable for a QA checklist.
- **actualResult**: tie to axe when a finding exists (cite issue # and rule id briefly). If proactive coverage with no matching finding, write: "Not determined by automated scan — verify manually."
- **expectedResult**: clear pass criteria (WCAG-aligned).
- Do not duplicate two cases with the same core action.`;

export function buildManualTestScenariosPrompt(scannedUrl: string, issues: ScanIssue[]): string {
  const capped = issues.slice(0, 60);
  const payload = issuesPayloadCompact(issues, 60);
  const findingsToon = encodeStructuredForLlm(payload);
  const intro =
    issues.length === 0
      ? `Scanned URL: ${scannedUrl}\nAutomated findings: **none** (axe reported 0 violations). Generate proactive manual regression scenarios appropriate for a typical content page at this URL.`
      : `Scanned URL: ${scannedUrl}\nTotal axe findings: ${issues.length}. Attached: ${capped.length} capped rows as TOON.\n\n${FINDINGS_TOON_HEADER}:\n${findingsToon}`;
  return intro;
}

export function manualTestScenariosSystemPrompt(): string {
  return SYSTEM;
}
