/**
 * Schema, types, and tolerant parsers for the Expert WCAG Audit mode
 * (see `lib/testingAnalysisPrompts.ts` mode: "expert-audit").
 *
 * The model is instructed to emit a fenced ```json``` block matching the shape
 * declared in `EXPERT_AUDIT_JSON_SCHEMA_LITERAL`. We parse defensively because
 * LLM output occasionally drifts from the requested format.
 */

export type ExpertSeverity = "CRITICAL" | "SERIOUS" | "MODERATE" | "MINOR";

export type ExpertVerdict = "PASS" | "FAIL" | "MANUAL VERIFICATION";

export type ExpertFinding = {
  /** Numeric position in the report (1-indexed). */
  number: number;
  /** WCAG success criterion, e.g. "1.4.3" or "2.4.7". */
  criterion: string;
  /** Optional WCAG technique IDs, e.g. ["H37", "G18"]. */
  techniqueIds?: string[];
  /** CRITICAL / SERIOUS / MODERATE / MINOR. */
  severity: ExpertSeverity;
  /** PASS / FAIL / MANUAL VERIFICATION (FAIL is the default for findings). */
  verdict?: ExpertVerdict;
  /** CSS selector or human-readable location of the offending element. */
  location: string;
  /** Plain-language description of the violation. */
  description: string;
  /** What the user actually experiences as a result. */
  userImpact: string;
  /** Verbatim HTML/CSS snippet showing the current (broken) markup. */
  beforeCode: string;
  /** Verbatim HTML/CSS snippet showing the proposed fix. */
  afterCode: string;
  /** Effort estimate, e.g. "Small (~30 min)", "Medium (~2 h)", "Large (~1 day)". */
  effort: string;
};

export type ExpertAuditReport = {
  executiveSummary: string;
  metrics: {
    totalFindings: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    /** Optional ratio of failures vs criteria evaluated, 0..1. */
    failRate?: number;
  };
  findings: ExpertFinding[];
  manualVerification: string[];
  passedCriteria: string[];
};

export type ExpertJiraTicket = {
  /** Jira summary line, ≤240 chars. */
  summary: string;
  /** Markdown description body. */
  description: string;
  /** axe impact (critical/serious/moderate/minor) or expert severity. */
  impact: string;
  /** Optional WCAG help URL. */
  helpUrl?: string;
  /** Optional sample HTML for context. */
  html?: string;
};

/**
 * Canonical schema literal embedded into the system prompt so the model knows
 * exactly which fields to emit. Kept as a string (not JSON Schema) for token
 * efficiency and so it renders cleanly inside the prompt.
 */
export const EXPERT_AUDIT_JSON_SCHEMA_LITERAL = `{
  "executiveSummary": "string (2-4 sentences)",
  "metrics": {
    "totalFindings": "integer",
    "critical": "integer",
    "serious": "integer",
    "moderate": "integer",
    "minor": "integer",
    "failRate": "number 0..1 (optional)"
  },
  "findings": [
    {
      "number": "integer (1-indexed)",
      "criterion": "string e.g. \\"1.4.3\\"",
      "techniqueIds": ["string e.g. \\"H37\\", \\"G18\\", \\"ARIA6\\""],
      "severity": "CRITICAL | SERIOUS | MODERATE | MINOR",
      "verdict": "FAIL | MANUAL VERIFICATION",
      "location": "css selector or element description",
      "description": "what is wrong",
      "userImpact": "what the user experiences",
      "beforeCode": "verbatim html/css snippet",
      "afterCode": "verbatim html/css snippet with the fix",
      "effort": "Small | Medium | Large with rough hours"
    }
  ],
  "manualVerification": ["string – item to verify by hand or with AT"],
  "passedCriteria": ["string – WCAG SC numbers that PASS based on evidence"]
}`;

export const EXPERT_AUDIT_JIRA_TICKETS_SCHEMA_LITERAL = `{
  "tickets": [
    {
      "summary": "string ≤240 chars, prefix with [A11y]",
      "description": "markdown description with WCAG reference, severity, fix",
      "impact": "critical | serious | moderate | minor",
      "helpUrl": "optional WCAG help URL",
      "html": "optional sample HTML (≤2000 chars)"
    }
  ]
}`;

/**
 * Pull the *last* fenced ```json``` block out of `text`. We grab the last one
 * because the "jira" output mode emits the markdown report first followed by
 * the JSON block of tickets at the end.
 */
function extractLastJsonBlock(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = fenceRe.exec(text)) !== null) {
    const inner = match[1]?.trim();
    if (inner && (inner.startsWith("{") || inner.startsWith("["))) {
      last = inner;
    }
  }
  if (last) return last;
  // Fallback: the whole text might be a bare JSON object.
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  return null;
}

function safeParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function coerceFinding(raw: unknown, fallbackIndex: number): ExpertFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sev = typeof o.severity === "string" ? o.severity.toUpperCase() : "";
  const severity: ExpertSeverity = (
    ["CRITICAL", "SERIOUS", "MODERATE", "MINOR"] as const
  ).includes(sev as ExpertSeverity)
    ? (sev as ExpertSeverity)
    : "MODERATE";
  return {
    number: typeof o.number === "number" ? o.number : fallbackIndex + 1,
    criterion: typeof o.criterion === "string" ? o.criterion : "",
    techniqueIds: isStringArray(o.techniqueIds) ? o.techniqueIds : undefined,
    severity,
    verdict:
      typeof o.verdict === "string" &&
      (o.verdict === "PASS" || o.verdict === "FAIL" || o.verdict === "MANUAL VERIFICATION")
        ? (o.verdict as ExpertVerdict)
        : "FAIL",
    location: typeof o.location === "string" ? o.location : "",
    description: typeof o.description === "string" ? o.description : "",
    userImpact: typeof o.userImpact === "string" ? o.userImpact : "",
    beforeCode: typeof o.beforeCode === "string" ? o.beforeCode : "",
    afterCode: typeof o.afterCode === "string" ? o.afterCode : "",
    effort: typeof o.effort === "string" ? o.effort : "",
  };
}

/** Parse the structured Expert audit JSON. Returns null if the shape is unrecoverable. */
export function parseExpertAuditJson(text: string): ExpertAuditReport | null {
  const block = extractLastJsonBlock(text);
  if (!block) return null;
  const parsed = safeParse<Record<string, unknown>>(block);
  if (!parsed || typeof parsed !== "object") return null;

  const findingsRaw = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings = findingsRaw
    .map((f, i) => coerceFinding(f, i))
    .filter((f): f is ExpertFinding => f !== null);

  const m = (parsed.metrics ?? {}) as Record<string, unknown>;
  const num = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : 0);

  return {
    executiveSummary: typeof parsed.executiveSummary === "string" ? parsed.executiveSummary : "",
    metrics: {
      totalFindings: num("totalFindings") || findings.length,
      critical: num("critical"),
      serious: num("serious"),
      moderate: num("moderate"),
      minor: num("minor"),
      failRate: typeof m.failRate === "number" ? (m.failRate as number) : undefined,
    },
    findings,
    manualVerification: isStringArray(parsed.manualVerification) ? parsed.manualVerification : [],
    passedCriteria: isStringArray(parsed.passedCriteria) ? parsed.passedCriteria : [],
  };
}

/**
 * Pull the `tickets` array out of the model's trailing JSON block. Used by the
 * Expert Audit runner when outputFormat === "jira" so the user can bulk-create
 * Jira issues from the same response that produced the markdown report.
 */
export function parseExpertAuditTickets(text: string): ExpertJiraTicket[] {
  const block = extractLastJsonBlock(text);
  if (!block) return [];
  const parsed = safeParse<Record<string, unknown>>(block);
  if (!parsed || typeof parsed !== "object") return [];
  const list = Array.isArray(parsed.tickets) ? parsed.tickets : [];
  const out: ExpertJiraTicket[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.summary !== "string" || !o.summary.trim()) continue;
    out.push({
      summary: o.summary.slice(0, 240),
      description: typeof o.description === "string" ? o.description : "",
      impact: typeof o.impact === "string" ? o.impact : "moderate",
      helpUrl: typeof o.helpUrl === "string" ? o.helpUrl : undefined,
      html: typeof o.html === "string" ? o.html.slice(0, 6000) : undefined,
    });
  }
  return out;
}
