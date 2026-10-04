"use client";

// The Vesyn hero: THE SCAFFOLD.
//
// (Second pass: the headline is now IN the WebGL scene - see typeWorld.ts - depth-tested against the
// molecule and blurred by a real depth-of-field pass; the camera ends INSIDE the structure.)
//
// One oversized molecule is the whole environment. Scroll flies the camera along its
// own longest bond path; the pointer pushes its atoms like a hand through gel. The
// headline is set enormous, twice - solid BEHIND the WebGL canvas and as an outline
// IN FRONT of it - so bonds weave through the letters. A graduated dial turns behind
// everything with the scroll. Nothing here is the lab; ENTER opens it.
//
// z-order: backdrop (light pools, grain) < WebGL (molecule, headline, distant molecules, depth of field)
//          < notes (annotations, facts, stages) < instrument < frame (mark, readout, index) < portal < loader
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "@/components/motion/TransitionProvider";
import { getHealth } from "@/lib/api";
import type { ApiHealth } from "@/types/api";
import { EnterPortal } from "./EnterPortal";
import { HeroBackdrop } from "./HeroBackdrop";
import { HeroFrame } from "./HeroFrame";
import { HeroLoader, shouldPlayLoader } from "./HeroLoader";
import { HeroNotes } from "./HeroNotes";
import { Instrument } from "./Instrument";
import { createBus } from "./heroBus";
import type { HeroFacts } from "./heroWorld";
import { ScaffoldScene } from "./ScaffoldScene";
import { useBusFrame } from "./useBusFrame";
import { useScrollProgress } from "./useScrollProgress";

const ENTER_MS = 1100; // the camera pushes forward over this long...
const WIPE_AT = 0.5; // ...and the page wipe starts from the portal partway through

export function Hero() {
  const router = useRouter();
  const { go } = useTransition();
  const bus = useMemo(() => createBus(), []);
  const { phase, jumpTo } = useScrollProgress(bus);
  const [facts, setFacts] = useState<HeroFacts | null>(null);
  const [health, setHealth] = useState<ApiHealth>("checking");
  const [loader, setLoader] = useState<"unknown" | "play" | "done">("unknown");
  const entering = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    router.prefetch("/dashboard");
  }, [router]);

  // The status shown is the real API health, polled gently.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await getHealth();
      if (!live) return;
      setHealth(r.status === "ok" ? "online" : "offline");
      timer = setTimeout(tick, 8000);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  const enterLab = useCallback(() => {
    if (entering.current) return;
    entering.current = true;
    const start = performance.now();
    bus.ctaHoverTarget = 1;
    const cta = document.querySelector("[data-cta]")?.getBoundingClientRect();
    const origin = cta
      ? { x: (cta.x + cta.width / 2) / window.innerWidth, y: (cta.y + cta.height / 2) / window.innerHeight }
      : { x: 0.5, y: 0.5 };
    let wiped = false;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ENTER_MS);
      bus.enter = k * k;
      if (!wiped && k >= WIPE_AT) {
        wiped = true;
        go("/dashboard", origin);
      }
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [bus, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && bus.progress >= 0.94) enterLab();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bus, enterLab]);

  // Pointer position drives parallax, the layers of type, and the physical response of the structure.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      bus.mouseTX = (e.clientX / window.innerWidth) * 2 - 1;
      bus.mouseTY = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [bus]);

  // The opening sequence plays once per session (and never under reduced motion).
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !shouldPlayLoader()) {
      bus.ready = true;
      setLoader("done");
    } else setLoader("play");
  }, [bus]);

  // The cursor names what is under it: EXPLORE over the structure, the atom's own name over an atom.
  useBusFrame(
    bus,
    (b) => {
      const el = mainRef.current;
      if (!el) return;
      const info = b.hover !== null ? facts?.atomInfo(b.hover) : null;
      // idle over the world (a small crosshair); INSPECT over an atom, with the atom's own name
      const cursor = info ? "inspect" : "idle";
      if (el.dataset.cursor !== cursor) el.dataset.cursor = cursor;
      const label = info ? "INSPECT" : ""; // the atom's own readout is the chip beside it
      if (el.dataset.cursorLabel !== label) el.dataset.cursorLabel = label;
    },
    20,
  );

  return (
    <main ref={mainRef} className="fixed inset-0 overflow-hidden bg-nc-base text-nc-hi" data-hero data-cursor="idle" data-cursor-label="">
      <h1 className="sr-only">Vesyn — AI scientific workforce. Chemistry, reasoned by machines.</h1>

      <HeroBackdrop bus={bus} />
      <ScaffoldScene bus={bus} onFacts={setFacts} />
      <HeroNotes bus={bus} facts={facts} />
      <Instrument bus={bus} facts={facts} />
      <HeroFrame bus={bus} phase={phase} health={health} facts={facts} railLength={facts?.layout.path.length ?? 0} onJump={jumpTo} onEnter={enterLab} />

      {/* the way in: revealed once the camera is inside the structure */}
      <EnterPortal bus={bus} onEnter={enterLab} active={phase.atEnd} />

      {loader === "unknown" && <div className="absolute inset-0 z-40 bg-nc-base" />}
      {loader === "play" && <HeroLoader bus={bus} engineReady={facts !== null} onDone={() => setLoader("done")} />}
    </main>
  );
}
