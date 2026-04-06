/** Presets map to axe-core rule tags (see https://github.com/dequelabs/axe-core/blob/develop/doc/API.md#run-parameters). */

export type WcagPresetId = "wcag20-a" | "wcag20-aa" | "wcag21-aa" | "wcag21-aaa" | "wcag22-aa";

export const WCAG_PRESET_OPTIONS: { id: WcagPresetId; label: string }[] = [
  { id: "wcag20-a", label: "WCAG 2.0 Level A" },
  { id: "wcag20-aa", label: "WCAG 2.0 Level AA" },
  { id: "wcag21-aa", label: "WCAG 2.1 Level AA (Recommended)" },
  { id: "wcag22-aa", label: "WCAG 2.2 Level AA" },
  { id: "wcag21-aaa", label: "WCAG 2.1 Level AAA" },
];

const ALLOWED: WcagPresetId[] = ["wcag20-a", "wcag20-aa", "wcag21-aa", "wcag21-aaa", "wcag22-aa"];

export function parseWcagPreset(raw: unknown): WcagPresetId {
  if (typeof raw === "string" && ALLOWED.includes(raw as WcagPresetId)) {
    return raw as WcagPresetId;
  }
  return "wcag21-aa";
}

export function axeTagsForPreset(preset: WcagPresetId): string[] {
  switch (preset) {
    case "wcag20-a":
      return ["wcag2a"];
    case "wcag20-aa":
      return ["wcag2a", "wcag2aa"];
    case "wcag21-aa":
      return ["wcag2a", "wcag2aa", "wcag21aa"];
    case "wcag22-aa":
      return ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
    case "wcag21-aaa":
      return ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21aa", "wcag21aaa"];
    default:
      return ["wcag2a", "wcag2aa", "wcag21aa"];
  }
}
