/**
 * Shared normative basis for AI-generated testing reports and manual scenarios.
 * Grounds analysis in public checklists and W3C WCAG — not a substitute for legal audit.
 */

export const TESTING_NORMATIVE_BASIS = `NORMATIVE BASIS — Apply this to every interpretation, table row, and recommendation (do not contradict WCAG intent):

1. **WebAIM WCAG 2 Checklist** (https://webaim.org/standards/wcag/checklist) — Practical checkpoints under the four principles: **Perceivable (1.x), Operable (2.x), Understandable (3.x), Robust (4.x)**. Use its plain-language themes and grouping when explaining what failed and why. The checklist simplifies WCAG; it is not the official normative spec.

2. **W3C How to Meet WCAG (Quick Reference)** (https://www.w3.org/WAI/WCAG22/quickref/) — Authoritative **success criterion IDs and levels (A / AA / AAA)** and links to understanding documents. When naming requirements, prefer **WCAG 2.x notation** (e.g. *1.4.3 Contrast (Minimum)*, *2.4.7 Focus Visible*) inferred from each issue’s **axe rule id**, **description**, and **helpUrl** when present.

3. **Section 508 (U.S. federal web)** — Current technical expectations align with **WCAG 2.0 Level A and AA**. The legacy WebAIM **§1194.22** checklist is **outdated** (WebAIM states to use the WCAG 2 checklist instead). Do **not** anchor analysis on old 508 HTML tables; map to **WCAG success criteria**.

4. **Granicus Accessibility Checklist** (https://granicus.com/resource/accessibility-checklist/) — Supplementary **digital service / engagement** best practices. Use for **extra manual verification themes** (e.g. end-to-end tasks, content clarity, multi-channel UX) where automation is weak — **in addition to** WCAG SC grounding, not instead of it.

**Tooling reality:** Findings come from **axe-core**, which relates to many WCAG SCs but **does not** prove full WCAG or 508 conformance. Frame output as **checklist-aligned QA and remediation guidance**, not a compliance certificate.`;

export const TESTING_NORMS_MANUAL_SCENARIOS = `Norms: Align cases with **WebAIM’s WCAG 2 checklist** themes and **W3C WCAG 2.x success criteria** (see W3C Quickref). For U.S. federal context, treat **Section 508** as **WCAG 2.0 A/AA**, not legacy §1194.22 checklists. Add **Granicus-style** digital-service checks (task flows, forms, content) where useful. In **expectedResult**, state pass criteria using **WCAG SC numbers and short names** when you can infer them from the scenario.`;
