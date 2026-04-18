/**
 * Fix 9 — single source of truth for API request validation.
 *
 * Every POST route under `app/api/*` should validate its body with one of
 * these Zod schemas via `validateRequest()` from `lib/validate-request.ts`.
 *
 * Design notes:
 *   - Schemas mirror the existing TypeScript types (`ScanIssue`,
 *     `ChatMessage`, etc.) so the inferred Zod output stays assignable to
 *     the domain types the rest of the app already speaks.
 *   - Where a downstream module already runs deeper validation (e.g.
 *     `parseAndValidateScanCookies`), the Zod schema only checks the
 *     coarse shape (`unknown[]`) and lets the specialist parser own the
 *     fine-grained rules. That avoids duplicating cookie / WCAG logic.
 *   - We use the Zod 4 idiomatic top-level helpers (`z.url()`,
 *     `z.email()`) where they exist; everything else is `z.string()` etc.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const ImpactSchema = z.enum(["critical", "serious", "moderate", "minor"]);

export const ScanIssueKindSchema = z.enum(["violation", "needs_review"]);

export const ScanIssueSourceSchema = z.enum(["axe", "ibm", "both"]);

/**
 * Mirrors `ScanIssue` from `lib/axeScanner.ts`. We deliberately keep the
 * unknown[] for `targets` because axe selectors are wildly heterogeneous
 * and a stricter schema would bounce legitimate payloads.
 */
export const ScanIssueSchema = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().min(1).max(200),
  description: z.string().max(20_000),
  impact: ImpactSchema,
  kind: ScanIssueKindSchema.optional(),
  html: z.string().max(20_000),
  helpUrl: z.string().max(2048),
  failureSummary: z.string().max(20_000).optional(),
  targets: z.array(z.unknown()).optional(),
  sourceUrl: z.string().max(2048).optional(),
  source: ScanIssueSourceSchema.optional(),
  wcagCriterion: z.string().max(32).optional(),
});

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(40_000),
});

export const ChatIssueFocusSchema = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().min(1).max(200),
  impact: z.string().min(1).max(32),
  description: z.string().max(20_000),
  helpUrl: z.string().max(2048),
});

/**
 * Mirrors the loose `ScanSummaryPayload` shape consumed by `chatWithContext`.
 * `byImpact` is keyed by impact label but additional keys are tolerated to
 * stay backward-compatible with older clients sending extra metadata.
 */
export const ScanSummaryPayloadSchema = z.object({
  scannedUrl: z.string().max(2048).optional(),
  total: z.number().int().nonnegative(),
  byImpact: z.record(z.string(), z.number().int().nonnegative()),
  topRules: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        count: z.number().int().nonnegative(),
      }),
    )
    .max(50),
});

// ---------------------------------------------------------------------------
// /api/scan
// ---------------------------------------------------------------------------

/**
 * `wcagPreset` is intentionally a free-form short string at the Zod
 * boundary; `parseWcagPreset()` (in `lib/wcagAxeTags.ts`) is the canonical
 * normaliser and silently falls back to the default for unknown values.
 * Tightening the schema would surface as a hard 400 for legacy clients.
 */
export const WcagPresetSchema = z.string().min(1).max(32);

/**
 * The `cookies` array is intentionally `unknown[]`: the deeper structural
 * + domain-binding checks already live in `parseAndValidateScanCookies`,
 * which is run immediately after Zod validation in the route handler.
 * Re-encoding those rules here would mean two places to maintain.
 */
export const ScanRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  wcagPreset: WcagPresetSchema.optional(),
  deepScan: z.boolean().optional(),
  requiresLogin: z.boolean().optional(),
  cookies: z.array(z.unknown()).max(60).optional().nullable(),
  includeAxeOverview: z.boolean().optional(),
  multiPage: z.boolean().optional(),
  maxPages: z.number().int().min(1).max(20).optional(),
  /** Mirror of the `?force=true` query param; either source bypasses the cache. */
  force: z.boolean().optional(),
});

export type ScanRequest = z.infer<typeof ScanRequestSchema>;

// ---------------------------------------------------------------------------
// /api/ai-explain
// ---------------------------------------------------------------------------

export const AiExplainRequestSchema = z.object({
  issue: ScanIssueSchema,
});

export type AiExplainRequest = z.infer<typeof AiExplainRequestSchema>;

// ---------------------------------------------------------------------------
// /api/chat
// ---------------------------------------------------------------------------

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(50),
  scanSummary: ScanSummaryPayloadSchema.optional().nullable(),
  issueFocus: ChatIssueFocusSchema.optional().nullable(),
  /** Pre-fetched explanation text the user is currently looking at. */
  explanationContext: z.string().max(24_000).optional().nullable(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ---------------------------------------------------------------------------
// /api/ai-testing-analysis
// ---------------------------------------------------------------------------

export const TestingAnalysisModeSchema = z.enum([
  "pour",
  "methods",
  "checkpoints",
  "comprehensive",
  "expert-audit",
]);

export const ExpertAuditPrioritySchema = z.enum(["aa", "aa-aaa"]);

export const ExpertAuditOutputFormatSchema = z.enum(["markdown", "json", "jira"]);

export const TestingAnalysisRequestSchema = z.object({
  scannedUrl: z.string().min(1).max(2048),
  mode: TestingAnalysisModeSchema,
  issues: z.array(ScanIssueSchema).max(500),
  priority: ExpertAuditPrioritySchema.optional(),
  outputFormat: ExpertAuditOutputFormatSchema.optional(),
});

export type TestingAnalysisRequest = z.infer<typeof TestingAnalysisRequestSchema>;

// ---------------------------------------------------------------------------
// /api/testing-scenarios
// ---------------------------------------------------------------------------

export const TestingScenariosRequestSchema = z.object({
  scannedUrl: z.string().min(1).max(2048),
  issues: z.array(ScanIssueSchema).max(500),
});

export type TestingScenariosRequest = z.infer<typeof TestingScenariosRequestSchema>;
