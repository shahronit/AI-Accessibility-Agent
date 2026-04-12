import { encode } from "@toon-format/toon";

const opts = { indent: 0, keyFolding: "safe" as const };

/**
 * Encode structured data for LLM prompts using TOON (Token-Oriented Object Notation)
 * for fewer tokens than JSON on uniform arrays. @see https://toonformat.dev
 */
export function encodeStructuredForLlm(value: unknown): string {
  return encode(value, opts);
}

/** Label used in user messages so models treat the block as TOON, not JSON. */
export const FINDINGS_TOON_HEADER = "Findings (TOON)";
