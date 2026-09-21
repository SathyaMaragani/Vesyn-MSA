"use client";

import { useEffect } from "react";
import { smoothStep, wheelPixels } from "./motionLogic";

interface Track {
  target: number;
  raf: number;
  last: number;
  writing: boolean;
}

/**
 * Inertial wheel scrolling for containers that opt in with `data-smooth-scroll`.
 * It is deliberately narrow: only tagged elements, never the window (the hero
 * spends the wheel on its own progress), never with Ctrl (zoom), never when the
 * container cannot scroll, and never when something already handled the event.
 * Keyboard, scrollbar drags and touch keep the browser's native behaviour.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const tracks = new WeakMap<HTMLElement, Track>();

    const step = (el: HTMLElement, t: Track) => (now: number) => {
      const dt = Math.min(0.05, Math.max(1 / 240, (now - t.last) / 1000)); // rAF stamps can precede performance.now()
      t.last = now;
      const cur = el.scrollTop;
      const next = smoothStep(cur, t.target, dt);
      const done = Math.abs(t.target - next) < 0.5;
      t.writing = true;
      el.scrollTop = done ? t.target : next;
      t.writing = false;
      // The user grabbed the scrollbar or the page moved under us: stop fighting it.
      if (!done && Math.abs(el.scrollTop - next) > 2) {
        t.raf = 0;
        return;
      }
      t.raf = done ? 0 : requestAnimationFrame(step(el, t));
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.deltaY === 0) return;
      let el = (e.target as Element | null)?.closest?.("[data-smooth-scroll]") as HTMLElement | null;
      if (!el) return;
      // a nested scrollable region (a <pre>, a table) that can take the wheel keeps it
      for (let n = e.target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) {
          const atTop = n.scrollTop <= 0 && e.deltaY < 0;
          const atEnd = n.scrollTop + n.clientHeight >= n.scrollHeight - 1 && e.deltaY > 0;
          if (!atTop && !atEnd) return;
        }
      }
      if (el.scrollHeight <= el.clientHeight + 1) return;
      const max = el.scrollHeight - el.clientHeight;
      let t = tracks.get(el);
      if (!t) {
        t = { target: el.scrollTop, raf: 0, last: performance.now(), writing: false };
        tracks.set(el, t);
      }
      if (!t.raf) t.target = el.scrollTop; // resync when idle
      t.target = Math.min(max, Math.max(0, t.target + wheelPixels(e.deltaY, e.deltaMode, el.clientHeight)));
      e.preventDefault();
      if (!t.raf) {
        t.last = performance.now();
        t.raf = requestAnimationFrame(step(el, t));
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
