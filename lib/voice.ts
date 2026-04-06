import type { ScanIssue } from "@/lib/axeScanner";

/** Chrome sends audio to a network service; mic + secure context are required. */
export function isSpeechRecognitionEnvironmentOk(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

export function getSpeechEnvironmentHint(): string | null {
  if (typeof window === "undefined") return null;
  if (window.isSecureContext) return null;
  const host = window.location.hostname;
  const isLan =
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    host.endsWith(".local");
  if (isLan || host === "0.0.0.0") {
    return "Voice recognition needs a secure context. Open this app at http://localhost:3000 (or https://your-domain), not via a LAN IP like http://192.168.x.x.";
  }
  return "Voice recognition needs a secure page (https:// or http://localhost).";
}

/**
 * Human-readable copy for SpeechRecognitionErrorEvent.error codes.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error
 */
export function formatSpeechError(code: string): string {
  switch (code) {
    case "network":
      return "Speech service unreachable (network). Stay online, allow microphone, and use http://localhost:3000 or HTTPS—not a raw LAN IP. If it persists, disable VPN/ad-block for this site or try another browser.";
    case "not-allowed":
      return "Microphone permission was denied. Allow microphone access in your browser site settings.";
    case "service-not-allowed":
      return "Speech recognition is blocked by the browser or system. Check site permissions and OS microphone privacy settings.";
    case "aborted":
      return "";
    case "no-speech":
      return "No speech detected—try again and speak right after the mic starts.";
    case "audio-capture":
      return "No microphone found or it is in use by another app.";
    case "bad-grammar":
      return "Speech recognition configuration error.";
    case "language-not-supported":
      return "This language is not supported for speech recognition.";
    default:
      return `Speech recognition error: ${code}`;
  }
}

/** Prime mic permission; helps some Chrome builds before SpeechRecognition.start(). */
export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API is not available in this browser.");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
}

export function releaseMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => {
    t.stop();
  });
}

export type VoiceCommand =
  | { type: "scan" }
  | { type: "explain_issue"; index: number }
  | { type: "filter_critical" }
  | { type: "filter_all" }
  | { type: "how_to_fix" }
  /** Send a scan-wide explanation request through AI chat. */
  | { type: "chat_explain_scan" }
  /** Speak a short summary of scan results (counts / top rules). */
  | { type: "speak_scan_summary" }
  | { type: "unknown"; raw: string };

/** Milliseconds of silence after speech before treating the utterance as complete. */
export const VOICE_SILENCE_END_MS = 5000;

type SpeechRecognitionConstructor = new () => SpeechRecognition;

const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition)
    : undefined;

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(SpeechRecognitionCtor);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Map free-form speech to structured commands used by the dashboard.
 */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const t = transcript.trim().toLowerCase();
  if (!t) return { type: "unknown", raw: transcript };

  if (t.includes("scan this page") || t.includes("start scan") || t.includes("run scan")) {
    return { type: "scan" };
  }

  if (t.includes("show critical") || t.includes("critical issues") || t.includes("only critical")) {
    return { type: "filter_critical" };
  }

  if (
    t.includes("show all") ||
    t.includes("all issues") ||
    t.includes("clear filter") ||
    t.includes("remove filter")
  ) {
    return { type: "filter_all" };
  }

  if (
    t.includes("explain the issues") ||
    t.includes("explain all issues") ||
    t.includes("explain these issues") ||
    t.includes("overview of issues") ||
    t.includes("summarize the issues")
  ) {
    return { type: "chat_explain_scan" };
  }

  if (
    t.includes("read the results") ||
    t.includes("read results") ||
    t.includes("tell me the results") ||
    t.includes("what issues") ||
    t.includes("share the results") ||
    t.includes("summarize results") ||
    t.includes("summary of results")
  ) {
    return { type: "speak_scan_summary" };
  }

  const explainMatch = t.match(/explain\s+issue\s+(\d+)/);
  if (explainMatch) {
    return { type: "explain_issue", index: Number(explainMatch[1]) };
  }

  if (t.includes("how to fix") || t.includes("how do i fix")) {
    return { type: "how_to_fix" };
  }

  return { type: "unknown", raw: transcript };
}

export type RecognitionHandlers = {
  onResult: (text: string) => void;
  /** Called with empty string when error should be ignored (e.g. aborted). */
  onError: (message: string) => void;
  onEnd?: () => void;
};

export function createRecognition(handlers: RecognitionHandlers): SpeechRecognition | null {
  if (!SpeechRecognitionCtor) return null;
  const rec = new SpeechRecognitionCtor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  rec.onresult = (event: SpeechRecognitionEvent) => {
    const last = event.results[event.results.length - 1];
    const text = last?.[0]?.transcript ?? "";
    handlers.onResult(text);
  };

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    const code = event.error || "speech recognition error";
    if (code === "aborted") {
      handlers.onError("");
      return;
    }
    handlers.onError(formatSpeechError(code));
  };

  rec.onend = () => {
    handlers.onEnd?.();
  };

  return rec;
}

export function buildScanSummarySpeech(params: {
  scannedUrl?: string;
  total: number;
  byImpact: Record<string, number>;
  topRules: { id: string; count: number }[];
}): string {
  const b = params.byImpact;
  const parts = [
    `Scan of ${params.scannedUrl ?? "the page"} found ${params.total} accessibility issues.`,
    `Critical ${b.critical ?? 0}, serious ${b.serious ?? 0}, moderate ${b.moderate ?? 0}, minor ${b.minor ?? 0}.`,
  ];
  if (params.topRules.length > 0) {
    parts.push(
      `Frequent rules include ${params.topRules
        .slice(0, 4)
        .map((r) => `${r.id} (${r.count})`)
        .join(", ")}.`,
    );
  }
  return parts.join(" ");
}

export type SpeakTextOptions = {
  onStart?: () => void;
  onEnd?: () => void;
};

/**
 * Queue one utterance (cancels any in-progress speech). Fires `onEnd` when the utterance
 * finishes, errors, or is interrupted by {@link stopSpeaking} / another `speakText` call
 * (browser-dependent; parent UI should also clear state when calling `stopSpeaking`).
 */
export function speakText(text: string, options?: SpeakTextOptions) {
  if (!isSpeechSynthesisSupported()) {
    options?.onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1;
  utter.pitch = 1;
  const end = options?.onEnd;
  utter.onstart = () => options?.onStart?.();
  if (end) {
    utter.onend = end;
    utter.onerror = end;
  }
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

/** Short summary for TTS after a long explanation */
export function summarizeForSpeech(explanation: string, issue?: ScanIssue | null): string {
  const head = explanation.split(/\n{2,}/)[0]?.trim() || explanation.slice(0, 280);
  const prefix = issue ? `Issue ${issue.index}, ${issue.id}. ` : "";
  return `${prefix}${head}`;
}
