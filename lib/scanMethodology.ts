import type { LucideIcon } from "lucide-react";
import { Ear, FolderTree, ListChecks, Users } from "lucide-react";

export type ScanMethodologyTier = "manual" | "partial" | "automated";

export type ScanMethodologyContext = {
  /** “Thorough single-page pass” — Tab through page before axe runs. */
  deepScan: boolean;
  /** Main scan page exposes inline voice + TTS for results. */
  voiceAssistantAvailable: boolean;
};

export type ScanMethodologyLayer = {
  id: string;
  title: string;
  tier: ScanMethodologyTier;
  tierLabel: string;
  description: string;
  Icon: LucideIcon;
};

export const SCAN_METHODOLOGY_TIER_LABELS: Record<ScanMethodologyTier, string> = {
  manual: "Manual practice",
  partial: "Partial in app",
  automated: "Automated in this scan",
};

/**
 * Four layers teams use for accessibility quality; maps each to what this product actually does.
 */
export function getScanMethodologyLayers(ctx: ScanMethodologyContext): ScanMethodologyLayer[] {
  const { deepScan, voiceAssistantAvailable } = ctx;

  return [
    {
      id: "real-sr-ux",
      title: "Real-world screen reader UX",
      tier: "manual",
      tierLabel: SCAN_METHODOLOGY_TIER_LABELS.manual,
      Icon: Users,
      description:
        "No automated tool captures announcement order, landmarks, table reading mode, or live regions the way people do with NVDA, JAWS, VoiceOver, or TalkBack. Use this scan to find rule-level gaps, then verify critical journeys with a real screen reader.",
    },
    {
      id: "sr-simulation",
      title: "Screen reader simulation",
      tier: "partial",
      tierLabel: SCAN_METHODOLOGY_TIER_LABELS.partial,
      Icon: Ear,
      description: voiceAssistantAvailable
        ? "The inline voice assistant can read summaries and drive commands with text-to-speech. That helps triage results but does not emulate a screen reader’s virtual buffer, focus order, or browsing modes—treat it as a convenience, not a substitute."
        : "Text-to-speech readouts (where available) are not a screen reader. They do not exercise platform accessibility APIs or browsing modes the way NVDA, JAWS, or VoiceOver do.",
    },
    {
      id: "dom-inspector",
      title: "DOM tree inspector",
      tier: "partial",
      tierLabel: SCAN_METHODOLOGY_TIER_LABELS.partial,
      Icon: FolderTree,
      description: deepScan
        ? "Each finding includes selectors and HTML context. Thorough mode is on, so the tool tabs through the page before the run to expose more widgets in the DOM—pair with browser DevTools (Elements) for the live tree and dynamic states."
        : "Each finding includes selectors and HTML context. Turn on Thorough single-page pass to tab the page before the run so more menus and dialogs exist in the DOM when axe evaluates—then use DevTools (Elements) for the full live tree.",
    },
    {
      id: "rule-linter",
      title: "Rule-based linter",
      tier: "automated",
      tierLabel: SCAN_METHODOLOGY_TIER_LABELS.automated,
      Icon: ListChecks,
      description:
        "Violations are produced by axe-core against the WCAG preset you selected: deterministic rules with clear IDs. This is the backbone of the scan; it complements—but does not replace—manual screen reader and design review.",
    },
  ];
}
