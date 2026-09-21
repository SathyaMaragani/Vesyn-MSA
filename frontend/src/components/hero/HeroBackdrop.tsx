"use client";

import React, { useEffect, useRef } from "react";
import type { HeroBus } from "./heroBus";
import { useBusFrame } from "./useBusFrame";

/** A small tile of film grain, drawn once. Plain alpha - a blend mode over a WebGL canvas costs frames. */
function makeGrainTile(size = 160): string | null {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 255 : 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 15;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

const GRADIENTS = [
  "radial-gradient(ellipse 60% 70% at 100% 0%, rgba(214,164,91,0.2), transparent 62%)",
  "radial-gradient(ellipse 70% 60% at 0% 108%, rgba(184,117,82,0.24), transparent 64%)",
  "linear-gradient(180deg, #191b18 0%, #131412 55%, #10110f 100%)",
].join(",");

/**
 * Everything behind the type and the structure: warm graphite ground, three coloured
 * light pools (mineral sage, oxidised copper, amber), the dial, and grain.
 */
export function HeroBackdrop({ bus }: { bus: HeroBus }) {
  const glow = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // grain joins the gradients as one more background of the SAME layer: no extra full-screen layer
    const tile = makeGrainTile();
    if (base.current && tile) {
      base.current.style.backgroundImage = `url(${tile}), ${GRADIENTS}`;
      base.current.style.backgroundSize = "160px 160px, auto, auto, auto";
    }
  }, []);

  useBusFrame(
    bus,
    (b) => {
      if (!glow.current) return;
      // the sage pool leans toward the pointer, and brightens when the way in is offered
      glow.current.style.transform = `translate3d(${(b.mouseX * 6).toFixed(2)}vw, ${(b.mouseY * 5).toFixed(2)}vh, 0)`;
      glow.current.style.opacity = String(0.8 + b.ctaHover * 0.2);
    },
    30,
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div ref={base} className="absolute inset-0" style={{ backgroundImage: GRADIENTS }} />
      <div
        ref={glow}
        className="absolute left-[38%] top-[8%] h-[78%] w-[52%] will-change-transform"
        style={{ background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(143,175,154,0.24), transparent 74%)" }}
      />
    </div>
  );
}
