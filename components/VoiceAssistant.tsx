"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createRecognition,
  getSpeechEnvironmentHint,
  isSpeechRecognitionEnvironmentOk,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  parseVoiceCommand,
  releaseMediaStream,
  requestMicrophoneStream,
  stopSpeaking,
  type VoiceCommand,
} from "@/lib/voice";

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

  const [speechSupported] = useState(() => isSpeechRecognitionSupported());
  const [ttsSupported] = useState(() => isSpeechSynthesisSupported());
  const [envOk] = useState(() => isSpeechRecognitionEnvironmentOk());
  const [envHint] = useState(() => getSpeechEnvironmentHint());

  const canUseMic = speechSupported && envOk;

  const cleanupSession = useCallback(() => {
    if (!releasedRef.current) {
      releasedRef.current = true;
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      recRef.current?.stop();
    }
    cleanupSession();
  }, [cleanupSession]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      releaseMediaStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!canUseMic) return;
    setError(null);
    stopSpeaking();

    if (!isSpeechRecognitionEnvironmentOk()) {
      setError(getSpeechEnvironmentHint() ?? "This page is not in a secure context for voice.");
      return;
    }

    releasedRef.current = false;
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

    const rec = createRecognition({
      onResult: (text) => {
        cleanupSession();
        setLastHeard(text);
        onCommand(parseVoiceCommand(text));
      },
      onError: (message) => {
        cleanupSession();
        if (message) setError(message);
      },
      onEnd: () => {
        cleanupSession();
      },
    });

    if (!rec) {
      cleanupSession();
      setError("Could not create speech recognition.");
      setStartingMic(false);
      return;
    }

    recRef.current = rec;
    setStartingMic(false);
    setListening(true);

    try {
      rec.start();
    } catch {
      cleanupSession();
      setError("Could not start listening. Close other tabs using the microphone and try again.");
    }
  }, [canUseMic, cleanupSession, onCommand]);

  const runTypedCommand = useCallback(() => {
    const t = typedCommand.trim();
    if (!t) return;
    setLastHeard(t);
    onCommand(parseVoiceCommand(t));
    setTypedCommand("");
  }, [typedCommand, onCommand]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Voice assistant</CardTitle>
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
            <Button type="button" variant="outline" onClick={() => stopSpeaking()}>
              <Square className="mr-2 size-4" aria-hidden />
              Stop speech
            </Button>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <Label htmlFor="typed-voice-cmd" className="text-muted-foreground">
            Or type the same commands
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="typed-voice-cmd"
              value={typedCommand}
              onChange={(e) => setTypedCommand(e.target.value)}
              placeholder='e.g. scan this page, explain issue 1, show critical issues'
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
            Try: &quot;Scan this page&quot;, &quot;Explain issue 1&quot;, &quot;Show critical issues&quot;, or &quot;How to fix this
            issue&quot;. Chrome uses an online speech service—stay on the network.
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
