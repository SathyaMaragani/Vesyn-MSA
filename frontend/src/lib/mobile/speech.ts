"use client";

// Voice input, through whatever the device gives us. Chrome on Android and Safari expose the Web Speech
// API under two names and nothing else does; when it is absent the hook reports `supported: false` and
// the caller keeps its text field, which is the whole fallback.
//
// To replace this with native Android speech or a cloud transcriber later, keep this return shape: the
// mic button only knows `supported`, `listening`, `start`, `stop` and the text it is handed.
import { useCallback, useEffect, useRef, useState } from "react";

/** The slice of the Web Speech API this uses. The DOM lib does not declare it. */
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const MESSAGE: Record<string, string> = {
  "not-allowed": "Microphone access was declined.",
  "service-not-allowed": "Microphone access was declined.",
  "no-speech": "Nothing was heard - try again.",
  network: "Speech recognition needs a connection.",
  aborted: "",
};

export interface Speech {
  /** false on every browser without the Web Speech API: hide the mic and keep typing */
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeech(onText: (text: string) => void): Speech {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<Recognition | null>(null);
  // the latest callback, so starting does not have to re-run when the caller re-renders
  const sink = useRef(onText);
  sink.current = onText;

  useEffect(() => {
    setSupported(ctor() !== null);
    return () => live.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Ctor = ctor();
    if (!Ctor || live.current) return;
    setError(null);
    let r: Recognition;
    try {
      r = new Ctor();
    } catch {
      setSupported(false);
      return;
    }
    r.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from({ length: e.results.length }, (_, i) => e.results[i]?.[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) sink.current(text);
    };
    r.onerror = (e) => {
      const m = MESSAGE[e.error] ?? `Voice input failed (${e.error}).`;
      setError(m || null);
    };
    r.onend = () => {
      live.current = null;
      setListening(false);
    };
    live.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      // start() throws if one is already running; onend clears it
      live.current = null;
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => live.current?.stop(), []);

  return { supported, listening, error, start, stop };
}
