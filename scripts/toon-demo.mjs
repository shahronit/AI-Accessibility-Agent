/**
 * Quick check that TOON encoding is available (same options as lib/toonEncode.ts).
 * Run: npm run toon:demo
 */
import { encode } from "@toon-format/toon";

const sample = [
  { index: 1, id: "color-contrast", impact: "serious", description: "Text too light" },
  { index: 2, id: "button-name", impact: "critical", description: "Missing name" },
];

console.log(encode(sample, { indent: 0, keyFolding: "safe" }));
