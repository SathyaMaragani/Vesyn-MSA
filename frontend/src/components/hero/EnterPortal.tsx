"use client";

import React, { useEffect, useRef } from "react";
import type { HeroBus } from "./heroBus";
import { END_THRESHOLD, portalOpacity, smooth, taglineOpacity } from "./journey";
import { useBusFrame } from "./useBusFrame";

/**
 * The identity's descriptor and the way in, set as a thin instrument marker rather than a button:
 * a hairline with corner ticks, the label, and an arrow that leans forward. Both hang from the
 * name in the 3D scene (bus.brand is where its ink is on screen): the descriptor under its left
 * edge, the way in lower and to its right, so the three read as one composition on a diagonal,
 * not a centred stack.
 *
 *   approach  the pointer's distance to the marker feeds the scene (bus.ctaHover): the structure
 *             starts to draw taut before you touch it
 *   hover     the hairline fills with amber light and the tracking opens
 *   click     the camera moves forward (Hero.enterLab) and the page opens /dashboard
 */
export function EnterPortal({ bus, onEnter, active }: { bus: HeroBus; onEnter: () => void; active: boolean }) {
  const tag = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLAnchorElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const glow = useRef<HTMLSpanElement>(null);
  const hovering = useRef(false);
  const at = useRef({ x: 0, y: 0, ready: false });

  // proximity: the closer the pointer, the more the structure reacts
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = marker.current;
      if (!el || bus.progress < END_THRESHOLD - 0.04) return;
      const r = el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.x + r.width / 2), e.clientY - (r.y + r.height / 2));
      const near = 1 - Math.min(1, Math.max(0, d / 320));
      if (!hovering.current) bus.ctaHoverTarget = near * near * 0.6;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [bus]);

  useBusFrame(
    bus,
    (b) => {
      const o = portalOpacity(b.progress);
      const tOp = taglineOpacity(b.progress);
      const B = b.brand;
      const H = window.innerHeight;
      const s = Math.min(1.5, Math.max(0.8, H / 900));
      if (B.visible) {
        // follow the ink softly (its own float and the pointer's parallax move it a little)
        const k = at.current.ready ? 0.18 : 1;
        at.current.x += (B.right - at.current.x) * k;
        at.current.y += (B.baseline - at.current.y) * k;
        at.current.ready = true;
      }
      const w = Math.min(420 * s, Math.max(300, (B.right - B.left) * 0.78));
      if (tag.current) {
        tag.current.style.opacity = String(B.visible ? tOp : 0);
        tag.current.style.transform = `translate3d(${(B.left + 6).toFixed(1)}px, ${(B.baseline + 30 * s).toFixed(1)}px, 0)`;
      }
      if (box.current) {
        box.current.style.width = `${w.toFixed(0)}px`;
        box.current.style.opacity = String(B.visible ? o : 0);
        box.current.style.transform = `translate3d(${(at.current.x - w).toFixed(1)}px, ${(at.current.y + 92 * s + (1 - o) * 16).toFixed(1)}px, 0)`;
        box.current.style.pointerEvents = b.progress >= END_THRESHOLD ? "auto" : "none";
      }
      // the hairline draws itself in as the marker appears
      if (line.current) line.current.style.transform = `scaleX(${smooth(o).toFixed(3)})`;
      if (glow.current) glow.current.style.opacity = String(Math.min(1, b.ctaHover * 1.4));
    },
    45,
  );

  const excite = (v: number) => {
    hovering.current = v > 0;
    bus.ctaHoverTarget = v;
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <div ref={tag} className="absolute left-0 top-0 whitespace-nowrap font-data text-[9px] tracking-[0.55em] text-nc-mid [text-shadow:0_0_12px_rgba(16,17,15,0.95)]" style={{ opacity: 0 }}>
        AI SCIENTIFIC WORKFORCE
      </div>
      <div ref={box} className="absolute left-0 top-0" style={{ opacity: 0, pointerEvents: "none", width: 380 }}>
        <a
          ref={marker}
          href="/dashboard"
          onClick={(e) => {
            e.preventDefault();
            onEnter();
          }}
          onMouseEnter={() => excite(1)}
          onMouseLeave={() => excite(0)}
          onFocus={() => excite(1)}
          onBlur={() => excite(0)}
          tabIndex={active ? 0 : -1}
          aria-label="Enter NEOchems"
          data-cta
          data-transition="manual"
          className="group relative flex items-center gap-5 py-5 outline-none"
        >
          {/* the hairline and its corner ticks */}
          <span ref={line} className="absolute inset-x-0 top-0 h-px origin-left bg-nc-mid/70" style={{ transform: "scaleX(0)" }} />
          <span ref={glow} className="absolute inset-x-0 top-0 h-px origin-left bg-gradient-to-r from-nc-warn via-nc-warn to-transparent shadow-[0_0_18px_2px_rgb(214_164_91/0.55)]" style={{ opacity: 0 }} />
          <i className="absolute left-0 top-0 h-2.5 w-px bg-nc-mid/70 transition-colors group-hover:bg-nc-warn" />
          <i className="absolute right-0 top-0 h-2.5 w-px bg-nc-mid/70 transition-colors group-hover:bg-nc-warn" />
          <span className="font-data text-[9px] tracking-[0.3em] text-nc-lo transition-colors group-hover:text-nc-warn">ACCESS 01</span>
          <span className="font-data text-[13px] tracking-[0.5em] text-nc-hi transition-[letter-spacing,color] duration-500 group-hover:tracking-[0.62em] group-hover:text-nc-warn">ENTER NEOCHEMS</span>
          <svg viewBox="0 0 28 10" className="h-2.5 w-7 text-nc-warn transition-transform duration-500 group-hover:translate-x-2" fill="none" aria-hidden>
            <path d="M0 5h26M21 1l5 4-5 4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </a>
      </div>
    </div>
  );
}
