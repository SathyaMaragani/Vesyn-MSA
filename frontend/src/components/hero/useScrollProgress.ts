"use client";

// ScrollController. The hero is a fixed full-screen stage, so "scroll" is spent on
// progress instead of moving the page: wheel, touch drag and keys push a target,
// and a per-frame ease brings the shown progress to it. Frame-rate independent.
import { useCallback, useEffect, useRef, useState } from "react";
import type { HeroBus } from "./heroBus";
import { END_THRESHOLD, chapterAt, clamp01 } from "./journey";

/** Wheel distance (px) needed to travel the whole film. */
const TRAVEL_PX = 4400;

const KEYS: Record<string, number> = {
  ArrowDown: 0.035,
  ArrowUp: -0.035,
  PageDown: 0.12,
  PageUp: -0.12,
  " ": 0.12,
};

export interface ScrollPhase {
  chapter: number;
  atEnd: boolean;
}

export function useScrollProgress(bus: HeroBus) {
  const target = useRef(0);
  const [phase, setPhase] = useState<ScrollPhase>({ chapter: 0, atEnd: false });
  const last = useRef<ScrollPhase>({ chapter: 0, atEnd: false });

  const jumpTo = useCallback((p: number) => {
    target.current = clamp01(p);
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    bus.reducedMotion = reduced;
    if (reduced) {
      // no scroll story: hold the final composition
      bus.progress = 1;
      target.current = 1;
    }

    const nudge = (d: number) => {
      if (!reduced) target.current = clamp01(target.current + d);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // browser zoom
      e.preventDefault();
      nudge(((e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY) || 0) / TRAVEL_PX);
    };
    let touchY: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") touchY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || touchY === null) return;
      nudge(((touchY - e.clientY) / window.innerHeight) * 0.28);
      touchY = e.clientY;
    };
    const onUp = () => {
      touchY = null;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key in KEYS) {
        e.preventDefault();
        nudge(KEYS[e.key]);
      } else if (e.key === "End") target.current = 1;
      else if (e.key === "Home") target.current = 0;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);

    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      bus.progress += (target.current - bus.progress) * (1 - Math.exp(-dt * 4.2));
      if (Math.abs(target.current - bus.progress) < 0.0005) bus.progress = target.current;
      const next: ScrollPhase = { chapter: chapterAt(bus.progress), atEnd: bus.progress >= END_THRESHOLD };
      if (next.chapter !== last.current.chapter || next.atEnd !== last.current.atEnd) {
        last.current = next;
        setPhase(next);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [bus]);

  return { phase, jumpTo };
}
