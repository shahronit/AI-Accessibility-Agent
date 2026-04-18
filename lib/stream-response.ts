import type Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";

/**
 * Server-side helpers for streaming Anthropic / Gemini text deltas to the
 * browser as a plain `text/plain` chunked response.
 *
 * Why a custom shape instead of Vercel's AI SDK or SSE framing? The two
 * existing client runners (ExpertAuditRunner, TestingAgentRunner) just want a
 * growing markdown string. A bare text body keeps the consumer to a few lines
 * of `getReader()`, and metadata (`model`, `outputFormat`) is carried out of
 * band on `X-AI-*` response headers so the body is *exactly* the report.
 *
 * Concurrency model:
 *   provider.stream() (AsyncIterable<string>)
 *     -> streamFromTextIterable wraps it as ReadableStream<Uint8Array>
 *     -> buildStreamingResponse adds anti-buffering headers
 *     -> client postAppStream consumes via res.body.getReader()
 *
 * Cancellation: the route handler passes its `req.signal` in; if the client
 * disconnects, we abort the underlying provider stream and close cleanly so
 * we never leak an Anthropic / Gemini request.
 */

export type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type StreamingHeaders = {
  model: string;
  mode: string;
  priority: string;
  outputFormat: string;
};

const encoder = new TextEncoder();

/**
 * Wrap an async iterable of text deltas into a ReadableStream<Uint8Array>.
 * Closes the stream on iterator completion or any thrown error. If `signal`
 * fires we tear down the iterator (provider SDKs honour their own AbortSignal
 * hooks; this is a best-effort terminator for whatever the iterator pulls).
 */
export function streamFromTextIterable(
  iter: AsyncIterable<string>,
  opts: { signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
  const { signal } = opts;
  let iterator: AsyncIterator<string> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      iterator = iter[Symbol.asyncIterator]();

      const onAbort = () => {
        try {
          controller.error(
            signal?.reason instanceof Error
              ? signal.reason
              : new DOMException("Aborted by client", "AbortError"),
          );
        } catch {
          // controller may already be closed
        }
        void iterator?.return?.().catch(() => {});
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) break;
          if (typeof next.value === "string" && next.value.length > 0) {
            controller.enqueue(encoder.encode(next.value));
          }
        }
        controller.close();
      } catch (err) {
        try {
          controller.error(err);
        } catch {
          // already errored
        }
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    },
    async cancel() {
      try {
        await iterator?.return?.();
      } catch {
        // ignore
      }
    },
  });
}

/**
 * Stream text deltas from Anthropic's `messages.stream()`. Filters the SDK
 * event stream down to plain text fragments — control events (start/stop,
 * usage updates, tool calls) are dropped because the route only needs the
 * markdown body to grow.
 */
export async function* anthropicTextStream(
  client: Anthropic,
  params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Anthropic.MessageParam[];
    signal?: AbortSignal;
  },
): AsyncGenerator<string, void, unknown> {
  const stream = client.messages.stream(
    {
      model: params.model,
      max_tokens: params.max_tokens,
      ...(params.system ? { system: params.system } : {}),
      messages: params.messages,
    },
    params.signal ? { signal: params.signal } : undefined,
  );

  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta" &&
        event.delta.text
      ) {
        yield event.delta.text;
      }
    }
  } finally {
    // MessageStream is finalised once the iterator drains; abort() is a
    // safety net for early-cancellation paths so the SDK clears its
    // controller and doesn't leak a hanging fetch.
    try {
      stream.abort();
    } catch {
      // ignore
    }
  }
}

/**
 * Stream text deltas from Gemini's `generateContentStream()`. We deliberately
 * skip the in-stream 429/503 retry loop that `chatCompletionGemini` uses for
 * the non-streaming path — re-attempting partway through a streamed response
 * would produce duplicate text in the client buffer. A fresh request starts
 * from scratch, so the worst case is the same as what the user already sees
 * on a transient Gemini failure.
 */
export async function* geminiTextStream(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  history: Content[];
  lastUserText: string;
  maxOutputTokens: number;
}): AsyncGenerator<string, void, unknown> {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const model = genAI.getGenerativeModel({
    model: params.model,
    ...(params.systemInstruction
      ? { systemInstruction: params.systemInstruction }
      : {}),
    generationConfig: { maxOutputTokens: params.maxOutputTokens },
  });
  const chat = model.startChat({ history: params.history });
  const result = await chat.sendMessageStream(params.lastUserText);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

/** Build the streaming Response with anti-buffering + metadata headers. */
export function buildStreamingResponse(opts: {
  stream: ReadableStream<Uint8Array>;
  model: string;
  mode: string;
  priority: string;
  outputFormat: string;
}): Response {
  return new Response(opts.stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-AI-Model": opts.model,
      "X-AI-Mode": opts.mode,
      "X-AI-Priority": opts.priority,
      "X-AI-Output-Format": opts.outputFormat,
    },
  });
}
