import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError, type Content } from "@google/generative-ai";
import type { ScanIssue } from "@/lib/axeScanner";
import { buildChatSystemPrompt, buildExplainPrompt, type ChatIssueFocus } from "@/lib/prompts";
import { parseManualTestCasesJson, type ManualTestCase } from "@/lib/manualTestScenario";
import {
  buildTestingAnalysisMessages,
  type TestingAnalysisMode,
  type TestingAnalysisOptions,
} from "@/lib/testingAnalysisPrompts";
import {
  buildManualTestScenariosPrompt,
  manualTestScenariosSystemPrompt,
} from "@/lib/testingScenariosPrompt";
import {
  anthropicTextStream,
  geminiTextStream,
  streamFromTextIterable,
} from "@/lib/stream-response";

/** AssemblyAI LLM Gateway model ids */
const aaDefaultModel = process.env.ASSEMBLYAI_MODEL_DEFAULT ?? "claude-sonnet-4-5-20250929";
const aaCriticalModel = process.env.ASSEMBLYAI_MODEL_CRITICAL ?? "claude-opus-4-6";

/** Direct Anthropic API model ids (console.anthropic.com) */
const antSonnetModel = process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-5";
const antOpusModel = process.env.ANTHROPIC_MODEL_OPUS ?? "claude-opus-4-6";

/** Google Gemini model ids (AI Studio) — see https://ai.google.dev/gemini-api/docs/models */
const gemDefaultModel = process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash";
const gemCriticalModel = process.env.GEMINI_MODEL_CRITICAL ?? "gemini-2.5-flash";

const GEMINI_429_ATTEMPTS_PER_MODEL = Math.min(
  Math.max(Number(process.env.GEMINI_429_ATTEMPTS_PER_MODEL ?? "4"), 1),
  8,
);

function geminiFallbackToAnthropic(): boolean {
  const v = process.env.GEMINI_FALLBACK_TO_ANTHROPIC?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

const LLM_URL =
  process.env.ASSEMBLYAI_LLM_URL?.trim() || "https://llm-gateway.assemblyai.com/v1/chat/completions";

const LLM_FETCH_TIMEOUT_MS = Number(process.env.ASSEMBLYAI_FETCH_TIMEOUT_MS ?? "90000");

type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatCompletionResponse = {
  choices?: Array<{ message?: { role?: string; content?: string | null } }>;
  error?: string | { message?: string; code?: number };
};

type LlmProvider = "gemini" | "anthropic" | "assemblyai";

function normalizeAssemblyApiKey(raw: string): string {
  let key = raw.trim().replace(/^\uFEFF/, "");
  if (/^Bearer\s+/i.test(key)) {
    key = key.replace(/^Bearer\s+/i, "");
  }
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

function getAssemblyApiKey(): string {
  const raw = process.env.ASSEMBLYAI_API_KEY;
  if (!raw?.trim()) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured");
  }
  const key = normalizeAssemblyApiKey(raw);
  if (!key) {
    throw new Error("ASSEMBLYAI_API_KEY is empty after trimming");
  }
  return key;
}

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey: key });
}

function collectAnthropicText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function hasAssemblyKey(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY?.trim());
}

/**
 * `LLM_PROVIDER=gemini` | `anthropic` | `assemblyai` forces that backend.
 * If unset: Anthropic (if key) → Gemini (if key) → AssemblyAI.
 */
export function resolvedLlmProvider(): LlmProvider {
  const p = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (p === "gemini") return "gemini";
  if (p === "anthropic") return "anthropic";
  if (p === "assemblyai") return "assemblyai";
  if (hasAnthropicKey()) return "anthropic";
  if (hasGeminiKey()) return "gemini";
  return "assemblyai";
}

function isLemurOrAccessError(message: string): boolean {
  return /lemur|does not have access to/i.test(message);
}

function parseGatewayJson(raw: string, status: number): ChatCompletionResponse {
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as ChatCompletionResponse;
  } catch {
    throw new Error(
      `LLM gateway returned non-JSON (HTTP ${status}). Check ASSEMBLYAI_LLM_URL or try again later.`,
    );
  }
}

function gatewayErrorMessage(data: ChatCompletionResponse, httpStatus: number): string {
  const e = data.error;
  if (typeof e === "string" && e.trim()) return e.trim();
  if (e && typeof e === "object" && typeof e.message === "string" && e.message.trim()) {
    return e.message.trim();
  }
  return `LLM request failed (HTTP ${httpStatus})`;
}

function llmFetch(authorizationValue: string, body: string, signal: AbortSignal) {
  return fetch(LLM_URL, {
    method: "POST",
    headers: {
      Authorization: authorizationValue,
      "Content-Type": "application/json",
    },
    body,
    signal,
  });
}

async function chatCompletionAssemblyAI(params: {
  model: string;
  messages: GatewayMessage[];
  max_tokens: number;
}): Promise<{ text: string; model: string }> {
  const apiKey = getAssemblyApiKey();
  const body = JSON.stringify({
    model: params.model,
    messages: params.messages,
    max_tokens: params.max_tokens,
  });

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_FETCH_TIMEOUT_MS);

  let res: Response;
  let raw: string;
  try {
    res = await llmFetch(apiKey, body, ac.signal);
    raw = await res.text();

    if (res.status === 401) {
      res = await llmFetch(`Bearer ${apiKey}`, body, ac.signal);
      raw = await res.text();
    }
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new Error(
      aborted
        ? `LLM request timed out after ${Math.round(LLM_FETCH_TIMEOUT_MS / 1000)}s. Try again or increase ASSEMBLYAI_FETCH_TIMEOUT_MS.`
        : `Could not reach AssemblyAI LLM gateway: ${e instanceof Error ? e.message : "network error"}`,
    );
  } finally {
    clearTimeout(t);
  }

  const data = parseGatewayJson(raw, res.status);

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        `${gatewayErrorMessage(data, 401)} Verify ASSEMBLYAI_API_KEY in .env.local (no spaces). Create or rotate a key at https://www.assemblyai.com/app/account.`,
      );
    }
    throw new Error(gatewayErrorMessage(data, res.status));
  }

  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("Empty response from LLM");
  }

  return { text, model: params.model };
}

function splitSystemAndConversation(messages: GatewayMessage[]): {
  system?: string;
  conversation: Anthropic.MessageParam[];
} {
  const systemChunks: string[] = [];
  const conversation: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemChunks.push(m.content);
    } else {
      conversation.push({ role: m.role, content: m.content });
    }
  }
  const system = systemChunks.length > 0 ? systemChunks.join("\n\n") : undefined;
  return { system, conversation };
}

async function chatCompletionAnthropic(params: {
  model: string;
  messages: GatewayMessage[];
  max_tokens: number;
}): Promise<{ text: string; model: string }> {
  const client = getAnthropicClient();
  const { system, conversation } = splitSystemAndConversation(params.messages);

  const res = await client.messages.create({
    model: params.model,
    max_tokens: params.max_tokens,
    ...(system ? { system } : {}),
    messages: conversation,
  });

  const text = collectAnthropicText(res.content);
  if (!text) {
    throw new Error("Empty response from Anthropic");
  }
  return { text, model: params.model };
}

/** Merge consecutive user or assistant turns so Gemini history alternates correctly. */
function mergeConsecutiveRoles(messages: GatewayMessage[]): GatewayMessage[] {
  const out: GatewayMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content += `\n\n${m.content}`;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function splitSystemAndNonSystem(messages: GatewayMessage[]): {
  systemInstruction?: string;
  dialogue: GatewayMessage[];
} {
  const systemChunks: string[] = [];
  const dialogue: GatewayMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemChunks.push(m.content);
    } else {
      dialogue.push(m);
    }
  }
  return {
    systemInstruction: systemChunks.length > 0 ? systemChunks.join("\n\n") : undefined,
    dialogue: mergeConsecutiveRoles(dialogue),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses "Please retry in 32.5s" from Google API error bodies. */
function parseGeminiRetryDelayMs(message: string): number | null {
  const m = message.match(/retry in ([\d.]+)\s*s/i);
  if (!m) return null;
  const sec = parseFloat(m[1]);
  if (Number.isNaN(sec) || sec < 0) return null;
  return Math.min(Math.ceil(sec * 1000) + 750, 120_000);
}

function isGeminiTransientError(e: unknown): boolean {
  if (e instanceof GoogleGenerativeAIFetchError && (e.status === 429 || e.status === 503)) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /429|503|Too Many Requests|Service Unavailable|exceeded your current quota|quota exceeded|high demand/i.test(msg);
}

/** @deprecated alias kept for call-sites — use isGeminiTransientError */
const isGeminiRateLimitError = isGeminiTransientError;

function geminiModelCandidates(primary: string): string[] {
  const fromEnv = process.env.GEMINI_MODEL_FALLBACKS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const builtin = ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const tail = fromEnv && fromEnv.length > 0 ? fromEnv : builtin.filter((id) => id !== primary);
  const chain = [primary, ...tail];
  const seen = new Set<string>();
  return chain.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
}

async function sendGeminiChatOnce(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  history: Content[];
  lastUserText: string;
  maxOutputTokens: number;
}): Promise<{ text: string; model: string }> {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const model = genAI.getGenerativeModel({
    model: params.model,
    ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
    generationConfig: { maxOutputTokens: params.maxOutputTokens },
  });
  const chat = model.startChat({ history: params.history });
  const result = await chat.sendMessage(params.lastUserText);
  const text = result.response.text().trim();
  if (!text) {
    throw new Error("Empty response from Gemini");
  }
  return { text, model: params.model };
}

async function chatCompletionGemini(params: {
  model: string;
  messages: GatewayMessage[];
  maxOutputTokens: number;
}): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const { systemInstruction, dialogue } = splitSystemAndNonSystem(params.messages);
  if (dialogue.length === 0) {
    throw new Error("No user or assistant content to send to Gemini");
  }

  let turns = [...dialogue];
  if (turns[turns.length - 1].role === "assistant") {
    turns = [...turns, { role: "user" as const, content: "Please continue." }];
  }

  const lastUser = turns[turns.length - 1];
  const prior = turns.slice(0, -1);

  const history: Content[] = prior.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const candidates = geminiModelCandidates(params.model);
  let lastErr: unknown;

  for (const modelId of candidates) {
    for (let attempt = 0; attempt < GEMINI_429_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await sendGeminiChatOnce({
          apiKey,
          model: modelId,
          systemInstruction,
          history,
          lastUserText: lastUser.content,
          maxOutputTokens: params.maxOutputTokens,
        });
      } catch (e) {
        lastErr = e;
        const msg = e instanceof Error ? e.message : String(e);

        if (isGeminiRateLimitError(e)) {
          const fromServer = parseGeminiRetryDelayMs(msg);
          const backoff = fromServer ?? Math.min(2500 * 2 ** attempt, 45_000);
          if (attempt < GEMINI_429_ATTEMPTS_PER_MODEL - 1) {
            await sleep(backoff);
            continue;
          }
          break;
        }

        if (e instanceof GoogleGenerativeAIFetchError && e.status === 404) {
          lastErr = e;
          break;
        }

        if (e instanceof GoogleGenerativeAIFetchError && typeof e.status === "number") {
          throw new Error(
            `Gemini request failed (HTTP ${e.status}): ${msg}. Model: ${modelId}. Key: https://aistudio.google.com/apikey — docs: https://ai.google.dev/gemini-api/docs/rate-limits`,
          );
        }
        throw new Error(
          `Gemini request failed: ${msg}. Model: ${modelId}. Key: https://aistudio.google.com/apikey`,
        );
      }
    }
  }

  const lastMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Gemini unavailable (rate limit / 503) after ${GEMINI_429_ATTEMPTS_PER_MODEL} attempts per model across: ${candidates.join(", ")}. ` +
      `Last error: ${lastMsg}. Options: wait and retry; set GEMINI_MODEL_DEFAULT / GEMINI_MODEL_FALLBACKS to other models; enable billing in Google AI; ` +
      `or add ANTHROPIC_API_KEY (app can fall back when LLM_PROVIDER=gemini). See https://ai.google.dev/gemini-api/docs/rate-limits`,
  );
}

async function runChatCompletion(params: {
  assemblyModel: string;
  anthropicModel: string;
  geminiModel: string;
  messages: GatewayMessage[];
  max_tokens: number;
}): Promise<{ text: string; model: string }> {
  const provider = resolvedLlmProvider();

  if (provider === "gemini") {
    if (!hasGeminiKey()) {
      throw new Error(
        "LLM_PROVIDER is gemini but GEMINI_API_KEY is missing. Create a key at https://aistudio.google.com/apikey or set LLM_PROVIDER to anthropic or assemblyai.",
      );
    }
    try {
      return await chatCompletionGemini({
        model: params.geminiModel,
        messages: params.messages,
        maxOutputTokens: params.max_tokens,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const exhausted =
        /rate limit|quota exceeded|429|503|Too Many Requests|Service Unavailable|high demand/i.test(msg) &&
        geminiFallbackToAnthropic() &&
        hasAnthropicKey();
      if (exhausted) {
        return chatCompletionAnthropic({
          model: params.anthropicModel,
          messages: params.messages,
          max_tokens: params.max_tokens,
        });
      }
      throw e;
    }
  }

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      throw new Error(
        "LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is missing. Add it from https://console.anthropic.com/ or use LLM_PROVIDER=gemini with GEMINI_API_KEY.",
      );
    }
    return chatCompletionAnthropic({
      model: params.anthropicModel,
      messages: params.messages,
      max_tokens: params.max_tokens,
    });
  }

  if (!hasAssemblyKey()) {
    if (hasAnthropicKey()) {
      return chatCompletionAnthropic({
        model: params.anthropicModel,
        messages: params.messages,
        max_tokens: params.max_tokens,
      });
    }
    if (hasGeminiKey()) {
      return chatCompletionGemini({
        model: params.geminiModel,
        messages: params.messages,
        maxOutputTokens: params.max_tokens,
      });
    }
    throw new Error(
      "Configure ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY, and/or GEMINI_API_KEY in .env.local.",
    );
  }

  try {
    return await chatCompletionAssemblyAI({
      model: params.assemblyModel,
      messages: params.messages,
      max_tokens: params.max_tokens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isLemurOrAccessError(msg)) {
      if (hasAnthropicKey()) {
        return chatCompletionAnthropic({
          model: params.anthropicModel,
          messages: params.messages,
          max_tokens: params.max_tokens,
        });
      }
      if (hasGeminiKey()) {
        return chatCompletionGemini({
          model: params.geminiModel,
          messages: params.messages,
          maxOutputTokens: params.max_tokens,
        });
      }
      throw new Error(
        `${msg} — AssemblyAI LLM/LeMUR is not on your plan. Add GEMINI_API_KEY (https://aistudio.google.com/apikey) or ANTHROPIC_API_KEY, or upgrade AssemblyAI: support@assemblyai.com`,
      );
    }
    throw e;
  }
}

export function selectExplainModel(issue: ScanIssue): string {
  const p = resolvedLlmProvider();
  if (p === "gemini") {
    return issue.impact === "critical" ? gemCriticalModel : gemDefaultModel;
  }
  if (p === "anthropic") {
    return issue.impact === "critical" ? antOpusModel : antSonnetModel;
  }
  return issue.impact === "critical" ? aaCriticalModel : aaDefaultModel;
}

export async function explainIssue(issue: ScanIssue): Promise<{ text: string; model: string }> {
  const userContent = buildExplainPrompt(issue);
  const assemblyModel = issue.impact === "critical" ? aaCriticalModel : aaDefaultModel;
  const anthropicModel = issue.impact === "critical" ? antOpusModel : antSonnetModel;
  const geminiModel = issue.impact === "critical" ? gemCriticalModel : gemDefaultModel;

  return runChatCompletion({
    assemblyModel,
    anthropicModel,
    geminiModel,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are an accessibility expert. Follow the user message structure exactly. Issue data at the top is **TOON** (Token-Oriented Object Notation)—parse it as structured fields. Write in professional corporate prose: no Markdown hash headings, no asterisk or underscore emphasis. Keep tables and the required ADD/REMOVE lines as specified.",
      },
      { role: "user", content: userContent },
    ],
  });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function chatWithContext(
  messages: ChatMessage[],
  scanSummary?: Parameters<typeof buildChatSystemPrompt>[0],
  issueFocus?: ChatIssueFocus | null,
  explanationText?: string | null,
): Promise<{ text: string; model: string }> {
  const focus =
    issueFocus != null
      ? { issue: issueFocus, explanationText: explanationText ?? null }
      : null;
  const system = buildChatSystemPrompt(scanSummary, focus);
  const gatewayMessages: GatewayMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  return runChatCompletion({
    assemblyModel: aaDefaultModel,
    anthropicModel: antSonnetModel,
    geminiModel: gemDefaultModel,
    max_tokens: 2048,
    messages: gatewayMessages,
  });
}

export type {
  TestingAnalysisMode,
  TestingAnalysisOptions,
  ExpertAuditPriority,
  ExpertAuditOutputFormat,
} from "@/lib/testingAnalysisPrompts";

/** Full-scan testing report: core principles, testing plan, essential checks, comprehensive, or expert-audit. */
export async function analyzeScanForTestingAgent(
  scannedUrl: string,
  issues: ScanIssue[],
  mode: TestingAnalysisMode,
  options: TestingAnalysisOptions = {},
): Promise<{ text: string; model: string }> {
  const { system, user } = buildTestingAnalysisMessages(scannedUrl, issues, mode, options);
  const isExpert = mode === "expert-audit";
  const max_tokens = mode === "comprehensive" || isExpert ? 8192 : 6144;
  return runChatCompletion({
    assemblyModel: isExpert ? aaCriticalModel : aaDefaultModel,
    anthropicModel: isExpert ? antOpusModel : antSonnetModel,
    geminiModel: isExpert ? gemCriticalModel : gemDefaultModel,
    max_tokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
}

/** Structured manual QA scenarios from scan context (JSON from model). */
export async function generateManualTestScenarios(
  scannedUrl: string,
  issues: ScanIssue[],
): Promise<{ testCases: ManualTestCase[]; model: string; raw: string }> {
  const user = buildManualTestScenariosPrompt(scannedUrl, issues);
  const system = manualTestScenariosSystemPrompt();
  const { text, model } = await runChatCompletion({
    assemblyModel: aaDefaultModel,
    anthropicModel: antSonnetModel,
    geminiModel: gemDefaultModel,
    max_tokens: 8192,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  let testCases: ManualTestCase[] = [];
  try {
    testCases = parseManualTestCasesJson(text);
  } catch {
    testCases = [];
  }
  return { testCases, model, raw: text };
}

/**
 * Streaming sibling of `analyzeScanForTestingAgent` — returns a
 * ReadableStream<Uint8Array> of raw markdown text deltas plus the resolved
 * `model` id (set on the response header by the route handler).
 *
 * Provider selection follows the same rules as `runChatCompletion`:
 *   - LLM_PROVIDER=gemini  -> Gemini stream (no in-stream fallback)
 *   - LLM_PROVIDER=anthropic -> Anthropic stream
 *   - default / assemblyai -> AssemblyAI non-streaming, emitted as one chunk
 *
 * Anthropic and Gemini emit incremental tokens; the AssemblyAI gateway is not
 * documented as a streaming endpoint, so we call the existing non-streaming
 * helper and push the whole result as a single chunk. From the route's and
 * client's perspective everything is a `ReadableStream`, so the UI code stays
 * uniform regardless of which provider answered.
 *
 * Caller passes `signal` from `req.signal` so disconnects propagate to the
 * SDK abort hooks and we never leak an in-flight Anthropic request.
 */
export async function analyzeScanForTestingAgentStream(
  scannedUrl: string,
  issues: ScanIssue[],
  mode: TestingAnalysisMode,
  options: TestingAnalysisOptions = {},
  signal?: AbortSignal,
): Promise<{ stream: ReadableStream<Uint8Array>; model: string }> {
  const { system, user } = buildTestingAnalysisMessages(scannedUrl, issues, mode, options);
  const isExpert = mode === "expert-audit";
  const max_tokens = mode === "comprehensive" || isExpert ? 8192 : 6144;

  const provider = resolvedLlmProvider();
  const messages: GatewayMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  if (provider === "anthropic") {
    if (!hasAnthropicKey()) {
      throw new Error(
        "LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is missing. Add it from https://console.anthropic.com/ or use LLM_PROVIDER=gemini with GEMINI_API_KEY.",
      );
    }
    const model = isExpert ? antOpusModel : antSonnetModel;
    const client = getAnthropicClient();
    const { system: sys, conversation } = splitSystemAndConversation(messages);
    const iter = anthropicTextStream(client, {
      model,
      max_tokens,
      ...(sys ? { system: sys } : {}),
      messages: conversation,
      ...(signal ? { signal } : {}),
    });
    return { stream: streamFromTextIterable(iter, { signal }), model };
  }

  if (provider === "gemini") {
    if (!hasGeminiKey()) {
      throw new Error(
        "LLM_PROVIDER is gemini but GEMINI_API_KEY is missing. Create a key at https://aistudio.google.com/apikey or set LLM_PROVIDER to anthropic or assemblyai.",
      );
    }
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const model = isExpert ? gemCriticalModel : gemDefaultModel;
    const { systemInstruction, dialogue } = splitSystemAndNonSystem(messages);
    if (dialogue.length === 0) {
      throw new Error("No user or assistant content to send to Gemini");
    }
    let turns = [...dialogue];
    if (turns[turns.length - 1].role === "assistant") {
      turns = [...turns, { role: "user" as const, content: "Please continue." }];
    }
    const lastUser = turns[turns.length - 1];
    const prior = turns.slice(0, -1);
    const history: Content[] = prior.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const iter = geminiTextStream({
      apiKey,
      model,
      ...(systemInstruction ? { systemInstruction } : {}),
      history,
      lastUserText: lastUser.content,
      maxOutputTokens: max_tokens,
    });
    return { stream: streamFromTextIterable(iter, { signal }), model };
  }

  // AssemblyAI gateway: no streaming. Fall back to the non-streaming call and
  // emit the whole result as one chunk so the route handler / client speak
  // the same protocol regardless of provider. If AssemblyAI returns a
  // gateway/access error and we have a streaming-capable key configured,
  // hand off to that provider mid-call exactly like runChatCompletion does.
  const assemblyModel = isExpert ? aaCriticalModel : aaDefaultModel;
  try {
    const { text, model } = await chatCompletionAssemblyAI({
      model: assemblyModel,
      messages,
      max_tokens,
    });
    const single: AsyncIterable<string> = (async function* () {
      yield text;
    })();
    return { stream: streamFromTextIterable(single, { signal }), model };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isLemurOrAccessError(msg)) {
      if (hasAnthropicKey()) {
        const model = isExpert ? antOpusModel : antSonnetModel;
        const client = getAnthropicClient();
        const { system: sys, conversation } = splitSystemAndConversation(messages);
        const iter = anthropicTextStream(client, {
          model,
          max_tokens,
          ...(sys ? { system: sys } : {}),
          messages: conversation,
          ...(signal ? { signal } : {}),
        });
        return { stream: streamFromTextIterable(iter, { signal }), model };
      }
      if (hasGeminiKey()) {
        const apiKey = process.env.GEMINI_API_KEY!.trim();
        const model = isExpert ? gemCriticalModel : gemDefaultModel;
        const { systemInstruction, dialogue } = splitSystemAndNonSystem(messages);
        const lastUser = dialogue[dialogue.length - 1];
        const prior = dialogue.slice(0, -1);
        const history: Content[] = prior.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const iter = geminiTextStream({
          apiKey,
          model,
          ...(systemInstruction ? { systemInstruction } : {}),
          history,
          lastUserText: lastUser?.content ?? "",
          maxOutputTokens: max_tokens,
        });
        return { stream: streamFromTextIterable(iter, { signal }), model };
      }
    }
    throw e;
  }
}
