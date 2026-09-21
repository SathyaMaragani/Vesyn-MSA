"use client";

import React, { useEffect, useRef, useState } from "react";
import { getHealth, listAgents } from "@/lib/api";
import type { HeroBus } from "./heroBus";
import {
  initialSteps,
  loaderVerdict,
  percentDone,
  registryStep,
  settleTimedOut,
  type LoaderStep,
} from "./loaderLogic";

const SEEN_KEY = "nc-hero-seen";

/** The full sequence plays once per browser session; coming back from the lab goes straight to the hero. */
export function shouldPlayLoader(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === null;
  } catch {
    return true;
  }
}

/** Orbital rings that breathe with the pointer: electron shells, drawn on a 2D canvas. */
function useOrbits(ref: React.RefObject<HTMLCanvasElement>, progress: React.MutableRefObject<number>, exit: React.MutableRefObject<number>) {
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext("2d");
    if (!cv || !g) return;
    let raf = 0;
    let mx = 0;
    let my = 0;
    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const size = 520;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    let sx = 0;
    let sy = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const t = now / 1000;
      sx += (mx - sx) * 0.06;
      sy += (my - sy) * 0.06;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      g.translate(size / 2, size / 2);
      const p = progress.current;
      const ex = exit.current; // 0..1 as the loader lifts: the shells open outward
      for (let i = 0; i < 4; i++) {
        const r = 62 + i * 46 + ex * ex * 320;
        const tilt = (i - 1.5) * 0.5 + sy * 0.35;
        const spin = t * (0.18 + i * 0.07) * (i % 2 ? -1 : 1) + sx * 0.6;
        const alpha = (0.16 + 0.34 * (i / 3) * (0.4 + 0.6 * p)) * (1 - ex);
        g.save();
        g.rotate(spin);
        g.scale(1, 0.34 + 0.16 * Math.cos(tilt * 2));
        g.strokeStyle = `rgba(143,175,154,${alpha})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
        // the electron on this shell
        const a = t * (0.9 - i * 0.16) + i * 2.1;
        g.fillStyle = `rgba(232,228,216,${(0.35 + 0.5 * p) * (1 - ex)})`;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, 2.1, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // nucleus: grows as checks answer
      g.fillStyle = `rgba(143,175,154,${(0.25 + 0.6 * p) * (1 - ex)})`;
      g.beginPath();
      g.arc(0, 0, 3 + 5 * p, 0, Math.PI * 2);
      g.fill();
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [ref, progress, exit]);
}

/**
 * The cinematic load. Every line is the result of a real check:
 *   MOLECULAR ENGINE       the hero molecule parsed and the world was built
 *   SCIENTIFIC ENVIRONMENT the WebGL scene rendered its first frame
 *   RESEARCH NODE          GET /health
 *   AGENT REGISTRY         GET /api/agents (the agents listed are the ones it returned)
 * An unreachable API is shown as OFFLINE; a check that never answers as NO RESPONSE.
 */
export function HeroLoader({ bus, engineReady, onDone }: { bus: HeroBus; engineReady: boolean; onDone: () => void }) {
  const [steps, setSteps] = useState<LoaderStep[]>(initialSteps);
  const [agents, setAgents] = useState<string[]>([]);
  const [lifting, setLifting] = useState(false);
  const [gone, setGone] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pct = useRef(0);
  const exit = useRef(0);
  const counter = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const start = useRef(0);
  const finished = useRef(false);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useOrbits(canvas, pct, exit);

  const settle = (id: LoaderStep["id"], state: LoaderStep["state"], detail: string) =>
    setSteps((prev) => prev.map((s) => (s.id === id && s.state === "pending" ? { ...s, state, detail } : s)));

  // real checks
  useEffect(() => {
    start.current = performance.now();
    let live = true;
    void getHealth().then((r) => live && settle("node", r.status === "ok" ? "ok" : "failed", r.status === "ok" ? "ONLINE" : "OFFLINE"));
    void listAgents().then((r) => {
      if (!live) return;
      if (r.status === "ok") {
        setAgents(r.data.map((a) => a.name.toUpperCase()));
        const s = registryStep({ ok: true, ids: r.data.map((a) => a.id) });
        settle("registry", s.state, s.detail);
      } else {
        const s = registryStep({ ok: false });
        settle("registry", s.state, s.detail);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (engineReady) settle("engine", "ok", "READY");
  }, [engineReady]);

  // the scene has drawn a frame once the camera telemetry has been written
  useEffect(() => {
    let raf = 0;
    const look = () => {
      if (bus.cam.z !== 0) settle("environment", "ok", "READY");
      else raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);
    return () => cancelAnimationFrame(raf);
  }, [bus]);

  // decide when to lift; animate the counter toward the real percentage
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const target = percentDone(stepsRef.current);
      shown.current += (target - shown.current) * 0.12;
      pct.current = shown.current / 100;
      if (counter.current) counter.current.textContent = String(Math.round(shown.current)).padStart(3, "0");
      const elapsed = performance.now() - start.current;
      const v = loaderVerdict(stepsRef.current, elapsed);
      if (v.done && !finished.current) {
        finished.current = true;
        if (v.timedOut) setSteps((prev) => settleTimedOut(prev));
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* private mode: the sequence just plays again next visit */
        }
        setLifting(true);
        bus.ready = true; // the molecule's opening begins as the shells open
        const t0 = performance.now();
        const open = () => {
          exit.current = Math.min(1, (performance.now() - t0) / 1100);
          if (exit.current < 1) requestAnimationFrame(open);
          else {
            setGone(true);
            onDone();
          }
        };
        requestAnimationFrame(open);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bus, onDone]);

  if (gone) return null;
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-nc-base transition-opacity duration-[900ms] ease-out"
      style={{
        opacity: lifting ? 0 : 1,
        pointerEvents: lifting ? "none" : "auto",
        background: "radial-gradient(ellipse 60% 70% at 100% 0%, rgba(214,164,91,0.16), transparent 62%), radial-gradient(ellipse 70% 60% at 0% 108%, rgba(184,117,82,0.2), transparent 64%), radial-gradient(ellipse 34% 40% at 50% 50%, rgba(143,175,154,0.14), transparent 72%), #10110f",
      }}
      role="status"
      aria-label="Loading NEOchems"
    >
      <canvas ref={canvas} className="h-[520px] w-[520px]" aria-hidden="true" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center" aria-hidden="true">
        <div className="font-data text-[34px] font-light tracking-[0.3em] text-nc-hi">
          <span ref={counter}>000</span>
        </div>
        <div className="mt-2 font-data text-[9px] tracking-[0.42em] text-nc-lo">INITIALIZING</div>
      </div>

      <div className="absolute bottom-[clamp(32px,7vh,84px)] left-[clamp(24px,4vw,64px)] font-data text-[10px] tracking-[0.28em]">
        <div className="mb-3 text-nc-mid">NEO<span className="text-nc-cyan">CHEMS</span></div>
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-3 leading-[1.9]">
            <span className={s.state === "ok" ? "text-nc-cyan" : s.state === "failed" ? "text-nc-bad" : "text-nc-lo"}>{s.state === "pending" ? "·" : "●"}</span>
            <span className="w-[19em] whitespace-nowrap text-nc-mid">{s.label}</span>
            <span className={"whitespace-nowrap " + (s.state === "ok" ? "text-nc-hi" : s.state === "failed" ? "text-nc-bad" : "text-nc-lo nc-pulse")}>{s.state === "pending" ? "…" : s.detail}</span>
          </div>
        ))}
        {agents.length > 0 && (
          <div className="mt-3 flex max-w-[34rem] flex-wrap gap-x-4 gap-y-1 text-[9px] text-nc-lo">
            {agents.map((a, i) => (
              <span key={a} className="nc-fade-in" style={{ animationDelay: `${i * 90}ms` }}>
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
