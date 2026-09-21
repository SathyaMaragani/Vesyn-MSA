"use client";

import { useEffect, useRef } from "react";
import type { HeroBus } from "./heroBus";

/** Run `cb` every animation frame (or throttled to `fps`) with the shared bus. DOM writes only - never setState. */
export function useBusFrame(bus: HeroBus, cb: (bus: HeroBus, t: number) => void, fps = 0): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (fps > 0 && now - last < 1000 / fps) return;
      last = now;
      ref.current(bus, now / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bus, fps]);
}
