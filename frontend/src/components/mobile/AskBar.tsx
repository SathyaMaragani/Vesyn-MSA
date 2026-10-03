"use client";

// ASK VESYN: the one input the whole app is built around. Type, speak, or photograph.
//
// The mic is the Web Speech API where the device has it and is simply absent where it does not; the
// camera is the platform's own capture input, not a custom viewfinder. Offline, the field keeps working
// and the draft is kept on the device - a question written on a train is still there at the station.
import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Mic, Square } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { loadDraft, saveDraft } from "@/lib/mobile/assistant";
import { useSpeech } from "@/lib/mobile/speech";

export interface AskBarProps {
  /** the question, and a photo if one was attached */
  onAsk: (text: string, image?: File) => void | boolean | Promise<void | boolean>;
  busy?: boolean;
  /** the API has not answered: the field still takes a draft, sending waits */
  offline?: boolean;
  placeholder?: string;
  /** docked above the bottom nav (chat) rather than sitting in the page (home) */
  dock?: boolean;
  autoFocus?: boolean;
}

export function AskBar({ onAsk, busy = false, offline = false, placeholder, dock = false, autoFocus = false }: AskBarProps) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const speech = useSpeech((heard) => setText((t) => {
    const next = t ? `${t} ${heard}` : heard;
    saveDraft(next);
    return next;
  }));

  // the draft survives a reload, a lost connection and switching screens
  useEffect(() => setText(loadDraft()), []);
  useEffect(() => {
    if (!image) { setPreview(null); return; }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const ready = !busy && !sending && !offline && (text.trim() !== "" || image !== null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    setNotice("");
    try {
      const accepted = await onAsk(text.trim(), image ?? undefined);
      if (accepted !== false) {
        setText("");
        setImage(null);
        saveDraft("");
        field.current?.blur();
      }
    } catch { setNotice("Could not send. Your draft is saved; please try again."); }
    finally { setSending(false); }
  };

  return (
    <form
      onSubmit={send}
      className={cx(
        "m-card px-2 py-2",
        dock && "m-card-lit rounded-2xl",
      )}
    >
      {image && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-nc-line bg-nc-base/60 px-3 py-2">
          {/* A local object URL; never uploaded until a vision adapter exists. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="Attached research image preview" className="h-20 w-20 shrink-0 rounded-lg object-contain" />}
          <span className="min-w-0 flex-1 truncate font-data text-[11px] text-nc-mid">{image.name}</span>
          <button type="button" onClick={() => setImage(null)} className="m-tap -my-2 rounded-lg px-1 text-[11.5px] text-nc-lo active:text-nc-hi">
            Remove
          </button>
        </div>
      )}

      <div className="flex items-end gap-1">
        <label className="sr-only" htmlFor="m-ask">
          Ask VESYN
        </label>
        <input
          id="m-ask"
          ref={field}
          value={text}
          autoFocus={autoFocus}
          disabled={busy || sending}
          onChange={(e) => { setText(e.target.value); saveDraft(e.target.value); }}
          enterKeyHint="send"
          spellCheck={false}
          placeholder={placeholder ?? (offline ? "Write it now, send when you are back online" : "Ask VESYN anything…")}
          className="min-h-[44px] min-w-0 flex-1 bg-transparent px-2 text-[16px] text-nc-hi outline-none placeholder:text-nc-lo"
        />

        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? "Stop listening" : "Ask by voice"}
            aria-pressed={speech.listening}
            className={cx("m-tap rounded-xl", speech.listening ? "text-nc-cyan" : "text-nc-mid active:text-nc-hi")}
          >
            {speech.listening ? <Square className="h-4 w-4 nc-pulse" aria-hidden /> : <Mic className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        )}

        <input
          ref={file}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setImage(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => file.current?.click()}
          aria-label="Photograph a structure or a note"
          className="m-tap rounded-xl text-nc-mid active:text-nc-hi"
        >
          <Camera className="h-[18px] w-[18px]" aria-hidden />
        </button>

        <button type="submit" disabled={!ready} aria-label="Send" className="m-primary ml-0.5 w-11 px-0">
          {busy ? <span className="nc-pulse font-data text-[11px]">···</span> : <ArrowUp className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      </div>

      {speech.listening && (
        <p className="mt-1.5 px-2 font-data text-[10.5px] uppercase tracking-[0.16em] text-nc-cyan" role="status">
          Listening…
        </p>
      )}
      {speech.error && (
        <p className="mt-1.5 px-2 text-[11.5px] text-nc-warn" role="status">
          {speech.error}
        </p>
      )}
      {(notice || offline) && <p role="status" className="mt-1.5 px-2 text-[11.5px] text-nc-warn">{notice || "You’re offline. Your draft is saved; send it when connected."}</p>}
    </form>
  );
}
