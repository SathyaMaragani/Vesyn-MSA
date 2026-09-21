"use client";

import React, { useRef } from "react";
import type { HeroBus } from "./heroBus";
import type { HeroFacts } from "./heroWorld";
import { STAGES, activeStage, annotationOpacity, reasoningOpacity, seg, smooth } from "./journey";
import { useBusFrame } from "./useBusFrame";

const REACH = 96; // px a leader line extends outward from its atom

interface NoteRefs {
  root: HTMLDivElement | null;
  line: SVGLineElement | null;
  text: HTMLDivElement | null;
}

/**
 * Information that lives in the environment, not in panels: leader lines pinned to real
 * atoms, the hovered atom's readout, the structure's facts, and the index of the seven
 * stages. Everything is derived from the parsed molecule or is the workforce's own roster.
 */
export function HeroNotes({ bus, facts }: { bus: HeroBus; facts: HeroFacts | null }) {
  const notes = useRef<NoteRefs[]>([]);
  const hover = useRef<HTMLDivElement>(null);
  const hoverTitle = useRef<HTMLDivElement>(null);
  const hoverDetail = useRef<HTMLDivElement>(null);
  const shown = useRef<number | null>(null);
  const stagesEl = useRef<HTMLDivElement>(null);
  const stageRows = useRef<(HTMLDivElement | null)[]>([]);

  useBusFrame(bus, (b) => {
    const intro = smooth(seg(b.intro, 0.55, 1));
    const o = annotationOpacity(b.progress) * intro;
    const dim = b.hover !== null ? 0.12 : 1; // the hovered atom gets the stage
    const c = b.projected.center;
    notes.current.forEach((r, i) => {
      const p = b.projected[`a${i}`];
      if (!r?.root) return;
      if (!p || !p.visible || !c || o < 0.01) {
        r.root.style.opacity = "0";
        return;
      }
      let ux = p.x - c.x;
      let uy = p.y - c.y;
      const l = Math.hypot(ux, uy) || 1;
      ux /= l;
      uy /= l;
      const dx = ux * REACH;
      const dy = uy * REACH * 0.7 - 8;
      const w = window.innerWidth;
      const edge = smooth((p.y - 70) / 50) * smooth((p.x - 40) / 60) * smooth((w - 40 - p.x) / 60);
      r.root.style.opacity = String(o * dim * edge);
      r.root.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      r.line?.setAttribute("x2", dx.toFixed(1));
      r.line?.setAttribute("y2", dy.toFixed(1));
      if (r.text) {
        r.text.style.left = `${dx + (dx < 0 ? -8 : 8)}px`;
        r.text.style.top = `${dy - 7}px`;
        r.text.style.transform = dx < 0 ? "translateX(-100%)" : "none";
      }
    });

    const h = hover.current;
    if (h && facts) {
      const hp = b.projected.hover;
      if (b.hover === null || !hp || !hp.visible) h.style.opacity = "0";
      else {
        if (shown.current !== b.hover) {
          shown.current = b.hover;
          const info = facts.atomInfo(b.hover);
          if (hoverTitle.current) hoverTitle.current.textContent = info?.title ?? "";
          if (hoverDetail.current) hoverDetail.current.textContent = info?.detail ?? "";
        }
        h.style.opacity = String(intro);
        h.style.transform = `translate(${(hp.x + 30).toFixed(1)}px, ${(hp.y - 58).toFixed(1)}px)`;
      }
    }

    // the seven stages: a quiet index that follows the camera along the bond path
    const ro = reasoningOpacity(b.progress);
    if (stagesEl.current) stagesEl.current.style.opacity = String(ro);
    const cur = activeStage(b.progress);
    stageRows.current.forEach((el, i) => {
      if (!el) return;
      el.style.opacity = i === cur ? "1" : "0.38";
      el.style.transform = `translate3d(${i === cur ? 10 : 0}px,0,0)`;
    });
  });

  if (!facts) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {facts.annotations.map((a, i) => (
        <div
          key={a.atom}
          ref={(el) => {
            notes.current[i] = { ...(notes.current[i] ?? { line: null, text: null }), root: el };
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ opacity: 0 }}
        >
          <svg className="absolute overflow-visible" width="1" height="1">
            <line
              ref={(el) => {
                notes.current[i] = { ...(notes.current[i] ?? { root: null, text: null }), line: el };
              }}
              x1="0"
              y1="0"
              x2="60"
              y2="-40"
              stroke="rgb(214 164 91 / 0.7)"
              strokeWidth="1"
            />
            <circle cx="0" cy="0" r="6" fill="none" stroke="rgb(214 164 91 / 0.95)" strokeWidth="1" />
            <circle cx="0" cy="0" r="1.6" fill="rgb(214 164 91)" />
          </svg>
          <div
            ref={(el) => {
              notes.current[i] = { ...(notes.current[i] ?? { root: null, line: null }), text: el };
            }}
            className="absolute whitespace-nowrap font-data text-[10px] tracking-[0.22em] text-nc-stone"
          >
            {a.text}
          </div>
        </div>
      ))}

      <div ref={hover} className="absolute left-0 top-0 border-l border-nc-warn/80 pl-3 will-change-transform" style={{ opacity: 0 }}>
        <div ref={hoverTitle} className="font-serif text-[26px] italic leading-none text-nc-hi" />
        <div ref={hoverDetail} className="mt-1.5 font-data text-[9px] tracking-[0.24em] text-nc-warn" />
      </div>

      {/* 02 - the seven stages of the workforce */}
      <div ref={stagesEl} className="absolute right-[clamp(20px,2.6vw,44px)] top-[clamp(92px,15vh,170px)] text-right" style={{ opacity: 0 }}>
        <div className="mb-3 font-data text-[9px] tracking-[0.36em] text-nc-lo">THE WORKFORCE</div>
        {STAGES.map((s, i) => (
          <div
            key={s}
            ref={(el) => {
              stageRows.current[i] = el;
            }}
            className="flex items-baseline justify-end gap-3 font-data text-[11px] leading-[2] tracking-[0.3em] text-nc-hi transition-[opacity,transform] duration-500"
          >
            {s}
            <span className="text-[9px] text-nc-warn">{String(i + 1).padStart(2, "0")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
