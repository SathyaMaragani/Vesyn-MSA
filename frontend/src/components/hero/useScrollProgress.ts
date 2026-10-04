"use client";

// ScrollController. The hero is a fixed full-screen stage, so "scroll" is spent on
// progress instead of moving the page: wheel, touch drag and keys push a target,
// and a critically damped spring brings the shown progress to it. Frame-rate independent.
//
// A spring, not an ease: an ease's speed is proportional to the distance left, so every wheel notch kicked the
// camera's speed up at once and let it decay - a lurch per notch. A spring keeps position AND velocity
// continuous, so a notch accelerates the camera instead. A long jump (End, the chapter rail) is capped at
// MAX_SPEED, so it glides rather than flying the whole film in under half a second.
import { useCallback, useEffect, useRef, useState } from "react";
import type { HeroBus } from "./heroBus";
import { END_THRESHOLD, chapterAt, clamp01 } from "./journey";

/** Wheel distance (px) needed to travel the whole film. */
const TRAVEL_PX = 4400;
/** Spring stiffness (1/s): how quickly the shown progress catches up; critically damped, so it never overshoots. */
const OMEGA = 4.6;
/** The fastest the film may play, in progress per second: a jump end to end takes about two seconds. */
const MAX_SPEED = 0.55;

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
    let speed = 0; // progress per second
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      // the exact step of a critically damped spring toward the target: stable at any frame time
      const x = bus.progress - target.current;
      const decay = Math.exp(-OMEGA * dt);
      const pull = (speed + OMEGA * x) * dt;
      let gap = (x + pull) * decay; // how far the shown progress is from the target
      speed = (speed - OMEGA * pull) * decay;
      if (Math.abs(speed) > MAX_SPEED) {
        // over the limit: glide at it, so position and speed stay in step - and never past the target
        speed = Math.sign(speed) * MAX_SPEED;
        gap = x + speed * dt;
        if (Math.sign(gap) !== Math.sign(x)) [gap, speed] = [0, 0];
      }
      bus.progress = clamp01(target.current + gap);
      if (Math.abs(target.current - bus.progress) < 0.0002 && Math.abs(speed) < 0.002) {
        bus.progress = target.current;
        speed = 0;
      }
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
