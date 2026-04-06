"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Keyboard, Mic, MicOff, Square, Volume2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

export function VoiceAssistant({ onCommand }: Props) {
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
    stopSpeaking();
    if (listening || recRef.current) {
      finalizedRef.current = true;
      clearSilenceTimer();
      try {
        recRef.current?.abort();
      } catch {
        recRef.current?.stop();
      }
      cleanupSession();
    } else {
      stopSpeaking();
    }
  }, [cleanupSession, clearSilenceTimer, listening]);

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
    stopSpeaking();

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
  }, [armSilenceTimer, canUseMic, cleanupSession, clearSilenceTimer, onCommand]);

  const runTypedCommand = useCallback(() => {
    const t = typedCommand.trim();
    if (!t) return;
    stopSpeaking();
    setLastHeard(t);
    onCommand(parseVoiceCommand(t));
    setTypedCommand("");
  }, [typedCommand, onCommand]);

  return (
    <Card className="agent-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex w-full items-center gap-2 text-base">
          <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Bot className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">Voice agent</span>
          <Volume2 className="text-muted-foreground size-4 shrink-0 opacity-70" aria-hidden />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {envHint ? (
          <Alert variant="destructive">
            <AlertTitle>Voice needs a secure page</AlertTitle>
            <AlertDescription>{envHint}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={listening ? "destructive" : "default"}
            onClick={() => void (listening ? stopListening() : startListening())}
            disabled={!canUseMic || startingMic}
            aria-pressed={listening}
          >
            {startingMic ? (
              <>
                <Mic className="mr-2 size-4 animate-pulse" aria-hidden />
                Starting…
              </>
            ) : listening ? (
              <>
                <MicOff className="mr-2 size-4" aria-hidden />
                Stop listening
              </>
            ) : (
              <>
                <Mic className="mr-2 size-4" aria-hidden />
                Speak command
              </>
            )}
          </Button>
          {ttsSupported ? (
            <Button type="button" variant="outline" onClick={stopAllVoice} aria-label="Stop speech and listening">
              <Square className="mr-2 size-4" aria-hidden />
              Stop speech
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => (listening ? stopListening() : undefined)} disabled={!listening}>
              <Square className="mr-2 size-4" aria-hidden />
              Stop all
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Listening ends automatically after {VOICE_SILENCE_END_MS / 1000} seconds without new speech. Stop speech also stops the microphone and TTS.
        </p>

        <div className="space-y-2 rounded-xl border border-dashed border-white/15 bg-muted/20 p-3">
          <Label htmlFor="typed-voice-cmd" className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
            <Keyboard className="size-3.5" aria-hidden />
            Type commands
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="typed-voice-cmd"
              value={typedCommand}
              onChange={(e) => setTypedCommand(e.target.value)}
              placeholder='e.g. scan this page, explain issue 1, explain the issues, read the results'
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runTypedCommand();
                }
              }}
              className="sm:flex-1"
            />
            <Button type="button" variant="secondary" onClick={runTypedCommand} disabled={!typedCommand.trim()}>
              Run command
            </Button>
          </div>
        </div>

        {!speechSupported ? (
          <p className="text-muted-foreground text-sm">Speech recognition is not supported in this browser.</p>
        ) : !envOk ? (
          <p className="text-muted-foreground text-sm">Fix the secure-context warning above to enable the microphone button.</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Try: &quot;Scan this page&quot;, &quot;Explain issue 1&quot;, &quot;Explain the issues&quot; (AI chat), &quot;Read the results&quot;,
            &quot;Show critical issues&quot;, or &quot;How to fix this issue&quot;. Chrome uses an online speech service—stay on the network.
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
      </CardContent>
    </Card>
  );
}
