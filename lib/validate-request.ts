/**
 * Fix 9 — Zod-backed request validation helper.
 *
 * Usage in a route handler:
 *
 *     const parsed = await validateRequest(req, ScanRequestSchema);
 *     if (!parsed.ok) return parsed.error;
 *     const { data } = parsed;
 *
 * The helper:
 *   - Reads the request body as JSON.
 *   - Returns a typed `{ ok: true, data }` on success.
 *   - Returns `{ ok: false, error: NextResponse }` on either malformed JSON
 *     or a Zod schema mismatch — the response is a 400 with the standard
 *     `{ error, details }` envelope. `details` carries `result.error.flatten()`
 *     (or `null` for JSON parse errors), so clients can highlight specific
 *     fields.
 */

import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

export type ValidationFailure = {
  ok: false;
  error: NextResponse;
};

export type ValidationSuccess<T> = {
  ok: true;
  data: T;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Convert a `ZodError` to the public-facing `details` envelope. Flatten
 * collapses nested issues into `{ formErrors, fieldErrors }`, which is
 * what downstream UI/CLI consumers can render directly.
 */
function flattenZodError(err: ZodError): unknown {
  // `error.flatten()` exists in both Zod 3 and Zod 4; the cast keeps the
  // compiler happy without pulling in version-specific imports.
  const e = err as unknown as { flatten?: () => unknown };
  return typeof e.flatten === "function" ? e.flatten() : { issues: err.issues };
}

export async function validateRequest<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<ValidationResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Invalid request: body is not valid JSON.", details: null },
        { status: 400 },
      ),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "Invalid request",
          details: flattenZodError(result.error),
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Variant for callers that need to validate a value they already have in
 * hand (e.g. a query-string object). Same return contract as
 * `validateRequest()`.
 */
export function validateValue<T>(
  value: unknown,
  schema: ZodType<T>,
): ValidationResult<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      error: NextResponse.json(
        {
          error: "Invalid request",
          details: flattenZodError(result.error),
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: result.data };
}
