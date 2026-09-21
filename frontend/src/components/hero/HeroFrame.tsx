"use client";

import React, { useRef } from "react";
import Link from "next/link";
import type { ApiHealth } from "@/types/api";
import type { HeroBus } from "./heroBus";
import type { HeroFacts } from "./heroWorld";
import { CHAPTERS, chapterAt, identityOpacity, pad3, seg, smooth, structureOpacity } from "./journey";
import type { ScrollPhase } from "./useScrollProgress";
import { useBusFrame } from "./useBusFrame";

const EXPLORE = { "data-cursor": "explore", "data-cursor-label": "EXPLORE" } as const;
const NAV = "group flex items-center justify-end gap-3 font-data text-[10px] tracking-[0.34em] text-nc-mid outline-none transition-colors duration-300 hover:text-nc-hi focus-visible:text-nc-hi";

/**
 * The instrument's edges. Each label exists because it reads something real:
 *   NODE      GET /health
 *   MOLECULE  the scene is running (and its formula)
 *   ORIGIN    the chapter of the journey, 00-03
 *   CAMERA    the station along the molecule's bond path the camera is nearest
 *   SCROLL    the journey's progress
 * plus a minimal index (SYSTEM / LAB / ABOUT), the chapter ticks, and a scroll cue.
 */
export function HeroFrame({
  bus,
  phase,
  health,
  facts,
  railLength,
  onJump,
  onEnter,
}: {
  bus: HeroBus;
  phase: ScrollPhase;
  health: ApiHealth;
  facts: HeroFacts | null;
  railLength: number;
  onJump: (p: number) => void;
  onEnter: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLSpanElement>(null);
  const origin = useRef<HTMLSpanElement>(null);
  const camera = useRef<HTMLSpanElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const meta = useRef<HTMLDivElement>(null);
  const tagline = useRef<HTMLDivElement>(null);
  const structure = useRef<HTMLDivElement>(null);

  useBusFrame(
    bus,
    (b) => {
      if (root.current) root.current.style.opacity = String(smooth(seg(b.intro, 0.3, 0.9)));
      if (scroll.current) scroll.current.textContent = pad3(b.progress * 100);
      if (origin.current) origin.current.textContent = CHAPTERS[chapterAt(b.progress)].id;
      if (camera.current) camera.current.textContent = String(b.rail + 1).padStart(2, "0");
      if (structure.current) structure.current.style.opacity = String(structureOpacity(b.progress));
      if (cue.current) cue.current.style.opacity = String(1 - smooth(seg(b.progress, 0.02, 0.1)));
      // the name is the subject at the end: the metadata steps back into the environment
      const id = identityOpacity(b.progress);
      if (meta.current) meta.current.style.opacity = String(1 - 0.62 * id);
      if (tagline.current) tagline.current.style.opacity = String(1 - id);
    },
    24,
  );

  const dot = health === "online" ? "bg-nc-ok" : health === "offline" ? "bg-nc-bad" : "bg-nc-lo";
  const label = health === "online" ? "ONLINE" : health === "offline" ? "OFFLINE" : "CHECKING";
  const chapter = CHAPTERS[phase.chapter];

  return (
    <div ref={root} className="pointer-events-none absolute inset-0" style={{ opacity: 0 }}>
      {/* technical mark, top-left */}
      <div className="absolute left-[clamp(20px,2.6vw,44px)] top-[clamp(18px,3.4vh,40px)] [text-shadow:0_0_14px_rgba(16,17,15,0.95),0_0_4px_rgba(16,17,15,0.9)]">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
            <path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9z" stroke="rgb(232 228 216)" strokeOpacity="0.8" />
            <circle cx="12" cy="12" r="2.6" fill="rgb(184 117 82)" />
          </svg>
          <span className="font-data text-[12px] tracking-[0.3em] text-nc-hi">
            NEO<span className="text-nc-cyan">chems</span>
          </span>
        </div>
        <div ref={tagline} className="mt-2 pl-[28px] font-data text-[8px] tracking-[0.38em] text-nc-lo">AI SCIENTIFIC WORKFORCE</div>
      </div>

      {/* live readout, left: every row reads real state */}
      <div ref={meta} className="pointer-events-auto absolute left-[clamp(20px,2.6vw,44px)] top-[clamp(92px,15vh,150px)] font-data text-[8.5px] leading-[2.05] tracking-[0.3em] [text-shadow:0_0_12px_rgba(16,17,15,0.95)] max-[1100px]:hidden" {...EXPLORE}>
        <div className="text-nc-mid">MOLECULAR INTELLIGENCE</div>
        <div className="mb-2 text-nc-lo">SYSTEM 01</div>
        <div className="flex gap-4">
          <span className="w-[8.5em] text-nc-lo">NODE</span>
          <span className="flex items-center gap-2 text-nc-hi" title={`GET /health → ${label.toLowerCase()}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${dot} ${health === "checking" ? "nc-pulse" : ""}`} />
            {label}
          </span>
        </div>
        <div className="flex gap-4">
          <span className="w-[8.5em] text-nc-lo">MOLECULE</span>
          <span className="text-nc-hi">ACTIVE{facts ? ` · ${facts.formula}` : ""}</span>
        </div>
        <div className="flex gap-4">
          <span className="w-[8.5em] text-nc-lo">ORIGIN</span>
          <span className="text-nc-hi">
            <span ref={origin}>00</span> <span className="text-nc-lo">{chapter.label}</span>
          </span>
        </div>
        <div className="flex gap-4">
          <span className="w-[8.5em] text-nc-lo">CAMERA</span>
          <span className="text-nc-hi">
            <span ref={camera}>01</span> <span className="text-nc-lo">/ {String(railLength).padStart(2, "0")}</span>
          </span>
        </div>
        {/* while the camera studies the structure, its facts join the readout (read from the SMILES) */}
        <div ref={structure} style={{ opacity: 0 }}>
          {facts && (
            <>
              <div className="flex gap-4">
                <span className="w-[8.5em] text-nc-lo">WEIGHT</span>
                <span className="text-nc-hi">{facts.weight !== null ? `${facts.weight.toFixed(2)} G/MOL` : "NOT REPORTED"}</span>
              </div>
              <div className="flex gap-4">
                <span className="w-[8.5em] text-nc-lo">RINGS</span>
                <span className="text-nc-hi">{facts.rings}</span>
              </div>
              <div className="flex gap-4">
                <span className="w-[8.5em] text-nc-lo">HEAVY ATOMS</span>
                <span className="text-nc-hi">{facts.heavyAtoms}</span>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-4">
          <span className="w-[8.5em] text-nc-lo">SCROLL</span>
          <span ref={scroll} className="text-nc-warn">
            000
          </span>
        </div>
      </div>

      {/* minimal index, top-right: three ways out of the hero, each with a marker */}
      <nav aria-label="Primary" className="pointer-events-auto absolute right-[clamp(20px,2.6vw,44px)] top-[clamp(18px,3.4vh,40px)] flex flex-col items-end gap-2 [text-shadow:0_0_14px_rgba(16,17,15,0.95),0_0_4px_rgba(16,17,15,0.9)]">
        <button type="button" onClick={() => onJump(1)} className={NAV} {...EXPLORE}>
          SYSTEM
          <span className="block h-px w-4 bg-nc-mid/60 transition-all duration-300 group-hover:w-8 group-hover:bg-nc-warn" />
          <span className="w-4 text-left text-[8px] text-nc-lo">01</span>
        </button>
        <button type="button" onClick={onEnter} className={NAV} {...EXPLORE}>
          LAB
          <span className="block h-px w-4 bg-nc-mid/60 transition-all duration-300 group-hover:w-8 group-hover:bg-nc-warn" />
          <span className="w-4 text-left text-[8px] text-nc-lo">02</span>
        </button>
        <Link href="/landing" className={NAV} {...EXPLORE}>
          ABOUT
          <span className="block h-px w-4 bg-nc-mid/60 transition-all duration-300 group-hover:w-8 group-hover:bg-nc-warn" />
          <span className="w-4 text-left text-[8px] text-nc-lo">03</span>
        </Link>
      </nav>

      {/* chapter index: the scroll's ticks, right edge (hover to read, click to jump) */}
      <div className="pointer-events-auto absolute right-[clamp(16px,2vw,32px)] top-[44%] flex -translate-y-1/2 flex-col items-end gap-5 max-[900px]:hidden">
        {CHAPTERS.map((c, i) => {
          const on = i === phase.chapter;
          return (
            <button key={c.id} type="button" onClick={() => onJump((c.from + Math.min(c.to, 1)) / 2 + (i === 0 ? -0.09 : i === CHAPTERS.length - 1 ? 0.08 : 0))} className="group flex items-center gap-3 outline-none" aria-label={`Go to ${c.label}`} {...EXPLORE}>
              <span className={`font-data text-[9px] tracking-[0.34em] transition-all duration-300 ${on ? "translate-x-0 text-nc-hi opacity-100" : "translate-x-2 text-nc-lo opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
                {c.label}
              </span>
              <span className={`block h-px transition-all duration-500 ${on ? "w-9 bg-nc-warn" : "w-4 bg-nc-mid/50 group-hover:w-7 group-hover:bg-nc-hi"}`} />
              <span className={`w-4 text-right font-data text-[9px] tracking-[0.1em] ${on ? "text-nc-warn" : "text-nc-lo"}`}>{c.id}</span>
            </button>
          );
        })}
      </div>

      {/* scroll cue: a single line with a moving mark, gone once you have begun */}
      <div ref={cue} className="absolute bottom-[clamp(20px,4vh,46px)] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 font-data text-[8px] tracking-[0.4em] text-nc-mid">
        <span>SCROLL</span>
        <span className="relative block h-9 w-px overflow-hidden bg-nc-line-strong">
          <span className="absolute inset-x-0 top-0 h-3 animate-[nc-cue_2.2s_ease-in-out_infinite] bg-nc-warn" />
        </span>
      </div>
    </div>
  );
}
