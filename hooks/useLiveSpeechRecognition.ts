"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatSpeechError, VOICE_SILENCE_END_MS } from "@/lib/voice";

type SpeechRecognitionConstructor = new () => SpeechRecognition;

function getSpeechCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition
  );
}

type Options = {
  onFinal: (transcript: string) => void;
  onError?: (message: string) => void;
};

/**
 * Continuous recognition with silence-based end (same UX as main voice assistant).
 */
export function useLiveSpeechRecognition({ onFinal, onError }: Options) {
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedFinalRef = useRef("");
  const latestCombinedRef = useRef("");
  const finalizedRef = useRef(false);
  const releasedRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearSilenceTimer();
    if (!releasedRef.current) {
      releasedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recRef.current = null;
    setListening(false);
  }, [clearSilenceTimer]);

  const stop = useCallback(() => {
    finalizedRef.current = true;
    clearSilenceTimer();
    const t = latestCombinedRef.current.trim();
    try {
      recRef.current?.abort();
    } catch {
      recRef.current?.stop();
    }
    cleanup();
    if (t) onFinal(t);
  }, [cleanup, clearSilenceTimer, onFinal]);

  const armTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      if (finalizedRef.current) return;
      const raw = latestCombinedRef.current;
      finalizedRef.current = true;
      clearSilenceTimer();
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      cleanup();
      const t = raw.trim();
      if (t) onFinal(t);
    }, VOICE_SILENCE_END_MS);
  }, [cleanup, clearSilenceTimer, onFinal]);

  const start = useCallback(async () => {
    const Ctor = getSpeechCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Speech recognition is not available.");
      return;
    }
    if (!window.isSecureContext) {
      onError?.("Use https:// or http://localhost for the microphone.");
      return;
    }

    finalizedRef.current = false;
    releasedRef.current = false;
    accumulatedFinalRef.current = "";
    latestCombinedRef.current = "";
    setStarting(true);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setStarting(false);
      onError?.("Microphone access denied.");
      return;
    }
    streamRef.current = stream;

    const rec = new Ctor();
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
        if (r.isFinal) accumulatedFinalRef.current += piece;
        else interim += piece;
      }
      latestCombinedRef.current = (accumulatedFinalRef.current + interim).trim();
      armTimer();
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event.error || "";
      clearSilenceTimer();
      if (code === "aborted") return;
      finalizedRef.current = true;
      onError?.(formatSpeechError(code));
      cleanup();
    };

    rec.onend = () => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      clearSilenceTimer();
      const t = latestCombinedRef.current.trim();
      cleanup();
      if (t) onFinal(t);
    };

    recRef.current = rec;
    setStarting(false);
    setListening(true);
    try {
      rec.start();
      armTimer();
    } catch {
      finalizedRef.current = true;
      cleanup();
      onError?.("Could not start microphone.");
    }
  }, [armTimer, cleanup, clearSilenceTimer, onError, onFinal]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [clearSilenceTimer]);

  return { listening, starting, start, stop };
}
