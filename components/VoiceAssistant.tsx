"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Keyboard, Loader2, Mic, MicOff, Square, Volume2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  formatSpeechError,
  getSpeechEnvironmentHint,
  isSpeechRecognitionEnvironmentOk,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  parseVoiceCommand,
  releaseMediaStream,
  requestMicrophoneStream,
  stopSpeaking,
  VOICE_SILENCE_END_MS,
  type VoiceCommand,
} from "@/lib/voice";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

const SpeechRecognitionCtor: SpeechRecognitionConstructor | undefined =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition)
    : undefined;

type Props = {
  onCommand: (cmd: VoiceCommand) => void;
  /** Sync when any in-app code calls {@link stopSpeaking} from this panel (mic start, stop all, etc.). */
  onTtsStopped?: () => void;
  /** Highlight stop control while the dashboard is reading aloud. */
  ttsSpeaking?: boolean;
  /** Compact layout next to Start scan (no card chrome). */
  variant?: "card" | "inline";
  className?: string;
};

export function VoiceAssistant({
  onCommand,
  onTtsStopped,
  ttsSpeaking = false,
  variant = "card",
  className,
}: Props) {
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [typedCommand, setTypedCommand] = useState("");
  const [startingMic, setStartingMic] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const releasedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedFinalRef = useRef("");
  const latestCombinedRef = useRef("");
  const finalizedRef = useRef(false);

  const [speechSupported] = useState(() => isSpeechRecognitionSupported());
  const [ttsSupported] = useState(() => isSpeechSynthesisSupported());
  const [envOk] = useState(() => isSpeechRecognitionEnvironmentOk());
  const [envHint] = useState(() => getSpeechEnvironmentHint());

  const canUseMic = speechSupported && envOk && Boolean(SpeechRecognitionCtor);

  const haltSpeech = useCallback(() => {
    stopSpeaking();
    onTtsStopped?.();
  }, [onTtsStopped]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const cleanupSession = useCallback(() => {
    clearSilenceTimer();
    if (!releasedRef.current) {
      releasedRef.current = true;
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
    }
    recRef.current = null;
    setListening(false);
  }, [clearSilenceTimer]);

  const finalizeListening = useCallback(
    (transcript: string, runCommand: boolean) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      clearSilenceTimer();
      const t = transcript.trim();
      if (t) {
        setLastHeard(t);
        if (runCommand) {
          onCommand(parseVoiceCommand(t));
        }
      }
      try {
        recRef.current?.stop();
      } catch {
        try {
          recRef.current?.abort();
        } catch {
          /* ignore */
        }
      }
      cleanupSession();
    },
    [cleanupSession, clearSilenceTimer, onCommand],
  );

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      const raw = latestCombinedRef.current;
      finalizeListening(raw, raw.trim().length > 0);
    }, VOICE_SILENCE_END_MS);
  }, [clearSilenceTimer, finalizeListening]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    finalizedRef.current = true;
    const t = latestCombinedRef.current.trim();
    try {
      recRef.current?.abort();
    } catch {
      recRef.current?.stop();
    }
    if (t) {
      setLastHeard(t);
      onCommand(parseVoiceCommand(t));
    }
    cleanupSession();
  }, [cleanupSession, clearSilenceTimer, onCommand]);

  const stopAllVoice = useCallback(() => {
    haltSpeech();
    if (listening || recRef.current) {
      finalizedRef.current = true;
      clearSilenceTimer();
      try {
        recRef.current?.abort();
      } catch {
        recRef.current?.stop();
      }
      cleanupSession();
    }
  }, [cleanupSession, clearSilenceTimer, haltSpeech, listening]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, [clearSilenceTimer]);

  const startListening = useCallback(async () => {
    if (!canUseMic || !SpeechRecognitionCtor) return;
    setError(null);
    haltSpeech();

    if (!isSpeechRecognitionEnvironmentOk()) {
      setError(getSpeechEnvironmentHint() ?? "This page is not in a secure context for voice.");
      return;
    }

    releasedRef.current = false;
    finalizedRef.current = false;
    accumulatedFinalRef.current = "";
    latestCombinedRef.current = "";
    setStartingMic(true);

    let stream: MediaStream | null = null;
    try {
      stream = await requestMicrophoneStream();
    } catch {
      setError("Microphone access was denied or no microphone is available. Allow the mic for this site and try again.");
      setStartingMic(false);
      return;
    }
    streamRef.current = stream;

    const rec = new SpeechRecognitionCtor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (finalizedRef.current) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const piece = r[0]?.transcript ?? "";
        if (r.isFinal) {
          accumulatedFinalRef.current += piece;
        } else {
          interim += piece;
        }
      }
      latestCombinedRef.current = (accumulatedFinalRef.current + interim).trim();
      armSilenceTimer();
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event.error || "speech recognition error";
      clearSilenceTimer();
      if (code === "aborted") {
        return;
      }
      finalizedRef.current = true;
      setError(formatSpeechError(code));
      cleanupSession();
    };

    rec.onend = () => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      clearSilenceTimer();
      const t = latestCombinedRef.current.trim();
      if (t) {
        setLastHeard(t);
        onCommand(parseVoiceCommand(t));
      }
      cleanupSession();
    };

    recRef.current = rec;
    setStartingMic(false);
    setListening(true);

    try {
      rec.start();
      armSilenceTimer();
    } catch {
      cleanupSession();
      setError("Could not start listening. Close other tabs using the microphone and try again.");
    }
  }, [armSilenceTimer, canUseMic, cleanupSession, clearSilenceTimer, haltSpeech, onCommand]);

  const runTypedCommand = useCallback(() => {
    const t = typedCommand.trim();
    if (!t) return;
    haltSpeech();
    setLastHeard(t);
    onCommand(parseVoiceCommand(t));
    setTypedCommand("");
  }, [haltSpeech, typedCommand, onCommand]);

  const inline = variant === "inline";
  const typedId = "typed-voice-cmd";
  const btnH = inline ? "h-11 shrink-0" : "";
  const inlineOutline =
    "border-white/10 bg-black/30 font-medium text-zinc-100 shadow-none hover:bg-white/5 hover:text-zinc-50";

  const envAlert =
    envHint ? (
      <Alert variant="destructive" className="border-red-500/40 bg-red-950/30">
        <AlertTitle className="text-sm">Voice needs a secure page</AlertTitle>
        <AlertDescription className="text-sm">{envHint}</AlertDescription>
      </Alert>
    ) : null;

  const micStopRow = (
    <div className={cn("flex flex-wrap gap-2", inline ? "w-full sm:w-auto sm:justify-end" : "w-full")}>
      <Button
        type="button"
        variant={listening ? "destructive" : inline ? "outline" : "default"}
        className={cn(
          inline && "min-w-[6.5rem] sm:min-w-[7.25rem]",
          btnH,
          inline && !listening && inlineOutline,
        )}
        onClick={() => void (listening ? stopListening() : startListening())}
        disabled={!canUseMic || startingMic}
        aria-pressed={listening}
        title={
          inline
            ? `Say "scan" to run like Start scan. Listening ends after ${VOICE_SILENCE_END_MS / 1000}s silence.`
            : undefined
        }
      >
        {startingMic ? (
          <>
            <Loader2 className="mr-2 size-4 shrink-0 animate-spin" aria-hidden />
            {inline ? "…" : "Starting…"}
          </>
        ) : listening ? (
          <>
            <MicOff className="mr-2 size-4 shrink-0" aria-hidden />
            {inline ? "Stop" : "Stop listening"}
          </>
        ) : (
          <>
            <Mic className="mr-2 size-4 shrink-0" aria-hidden />
            {inline ? "Voice" : "Speak command"}
          </>
        )}
      </Button>
      {ttsSupported ? (
        <Button
          type="button"
          variant={ttsSpeaking ? "destructive" : "outline"}
          className={cn(btnH, inline && !ttsSpeaking && inlineOutline)}
          onClick={stopAllVoice}
          aria-label="Stop read-aloud and listening"
        >
          <Square className={cn("size-4 shrink-0", inline ? "sm:mr-2" : "mr-2")} aria-hidden />
          <span className={cn(inline && "max-sm:sr-only")}>
            {ttsSpeaking ? "Stop speaking" : "Stop speech"}
          </span>
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className={cn(btnH, inline && inlineOutline)}
          onClick={() => (listening ? stopListening() : undefined)}
          disabled={!listening}
        >
          <Square className="mr-2 size-4 shrink-0" aria-hidden />
          {inline ? "Stop" : "Stop all"}
        </Button>
      )}
    </div>
  );

  if (inline) {
    return (
      <div
        className={cn("flex min-w-0 flex-1 flex-col gap-2 sm:items-end", className)}
        role="region"
        aria-label="Voice controls"
      >
        {envAlert}
        {micStopRow}
        {lastHeard ? (
          <p className="text-muted-foreground w-full max-w-full truncate text-left text-xs sm:text-right" title={lastHeard}>
            <span className="text-zinc-500">Heard: </span>
            <span className="text-zinc-400">{lastHeard}</span>
          </p>
        ) : null}
        {error ? (
          <p className="text-destructive w-full text-left text-xs sm:text-right" role="alert">
            {error}
          </p>
        ) : null}
        {!speechSupported && !envHint ? (
          <p className="text-muted-foreground w-full text-left text-xs sm:text-right">Voice not supported in this browser.</p>
        ) : null}
        {speechSupported && !envOk && !envHint ? (
          <p className="text-muted-foreground w-full text-left text-xs sm:text-right">Use HTTPS to enable the microphone.</p>
        ) : null}
      </div>
    );
  }

  const body = (
    <>
      {envAlert}
      {micStopRow}
      <p className="text-muted-foreground text-xs">
        Listening stops after {VOICE_SILENCE_END_MS / 1000}s of silence.
      </p>

      <div className="space-y-2 rounded-xl border border-dashed border-white/15 bg-muted/20 p-3">
        <Label
          htmlFor={typedId}
          className="text-muted-foreground flex items-center gap-2 text-xs font-medium"
        >
          <Keyboard className="size-3.5" aria-hidden />
          Type command
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={typedId}
            value={typedCommand}
            onChange={(e) => setTypedCommand(e.target.value)}
            placeholder='e.g. scan this page, explain issue 1, read the results'
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runTypedCommand();
              }
            }}
            className="text-sm sm:flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            className="text-sm"
            onClick={runTypedCommand}
            disabled={!typedCommand.trim()}
          >
            Run command
          </Button>
        </div>
      </div>

      {!speechSupported ? (
        <p className="text-muted-foreground text-sm">Speech recognition is not supported in this browser.</p>
      ) : !envOk ? (
        <p className="text-muted-foreground text-sm">
          Fix the secure-context warning above to enable the microphone button.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Examples: &quot;Scan this page&quot;, &quot;Explain issue 1&quot;, &quot;Explain the issues&quot;, &quot;Read the
          results&quot;.
        </p>
      )}
      {lastHeard ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Heard: </span>
          {lastHeard}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  return (
    <Card className={cn("agent-card", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex w-full items-center gap-2 text-base">
          <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Bot className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">Voice agent</span>
          <Volume2 className="text-muted-foreground size-4 shrink-0 opacity-70" aria-hidden />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{body}</CardContent>
    </Card>
  );
}
