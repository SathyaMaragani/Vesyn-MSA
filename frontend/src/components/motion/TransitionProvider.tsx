"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { COVER_MS, classifyNavigation, clamp01, destinationLabel, wipeAt } from "./motionLogic";
import { createWipe, type Wipe } from "./wipeShader";

interface Origin {
  x: number; // 0..1 across the viewport
  y: number; // 0..1 down the viewport
}

interface TransitionApi {
  /** Navigate with the full-screen wipe. Falls back to a plain navigation if it cannot run. */
  go(href: string, origin?: Origin): void;
}

const Ctx = createContext<TransitionApi>({ go: (href) => window.location.assign(href) });
export const useTransition = () => useContext(Ctx);

interface Run {
  start: number;
  path: string;
  hard: boolean;
  pushed: boolean;
  navReadyAt: number | null;
  origin: Origin;
}

/**
 * Site-wide page transitions. A noise-dissolve wipe (fragment shader) sweeps out
 * from the clicked point, the route changes under it, and the wipe recedes once the
 * destination has reported in. Moves that stay inside one persistent world (the lab
 * and its sheets) are left to Next untouched; only crossings between sections wipe.
 */
export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlay = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const wipe = useRef<Wipe | null>(null);
  const glFailed = useRef(false);
  const run = useRef<Run | null>(null);
  const raf = useRef(0);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const finish = useCallback(() => {
    run.current = null;
    cancelAnimationFrame(raf.current);
    if (overlay.current) overlay.current.style.display = "none";
  }, []);

  const tick = useCallback(
    (now: number) => {
      const r = run.current;
      if (!r) return;
      const elapsed = now - r.start;
      if (!r.pushed && elapsed >= COVER_MS) {
        r.pushed = true;
        if (r.hard) {
          window.location.assign(r.path); // another root layout: a real document load
          return;
        }
        router.push(r.path);
      }
      const { phase, cover } = wipeAt(elapsed, r.navReadyAt);
      if (phase === "idle") {
        finish();
        return;
      }
      const el = overlay.current;
      if (el && canvas.current) {
        if (!wipe.current && !glFailed.current) {
          wipe.current = createWipe(canvas.current);
          if (!wipe.current) glFailed.current = true;
        }
        if (wipe.current) {
          wipe.current.resize();
          wipe.current.render(cover, r.origin.x, 1 - r.origin.y, now / 1000);
          el.style.background = "transparent";
        } else {
          el.style.background = `rgb(3 6 10 / ${cover})`; // no WebGL: a plain fade
        }
      }
      if (label.current) label.current.style.opacity = String(clamp01((cover - 0.55) / 0.35));
      raf.current = requestAnimationFrame(tick);
    },
    [finish, router],
  );

  const begin = useCallback(
    (path: string, hard: boolean, origin: Origin) => {
      if (run.current) return;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        if (hard) window.location.assign(path);
        else router.push(path);
        return;
      }
      run.current = { start: performance.now(), path, hard, pushed: false, navReadyAt: null, origin };
      if (label.current) {
        const dest = label.current.querySelector("[data-dest-label]");
        if (dest) dest.textContent = destinationLabel(path);
      }
      if (overlay.current) overlay.current.style.display = "block";
      raf.current = requestAnimationFrame(tick);
    },
    [router, tick],
  );

  const go = useCallback(
    (href: string, origin: Origin = { x: 0.5, y: 0.5 }) => {
      const c = classifyNavigation(pathRef.current, href, window.location.origin);
      if (c.kind === "none") return;
      if (c.kind === "soft") router.push(c.path);
      else begin(c.path, c.kind === "hard", origin);
    },
    [begin, router],
  );

  // The destination has reported in once the pathname is the one we pushed.
  useEffect(() => {
    const r = run.current;
    if (r && r.pushed && !r.hard && r.navReadyAt === null && pathname === r.path.split("?")[0]) {
      r.navReadyAt = performance.now() - r.start;
    }
  }, [pathname]);

  // Every ordinary link click that crosses sections gets the wipe. Opt out with data-transition="manual".
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const c = classifyNavigation(pathRef.current, a.getAttribute("href") ?? "", window.location.origin, {
        button: e.button,
        meta: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
        target: a.getAttribute("target"),
        download: a.hasAttribute("download"),
        optOut: a.dataset.transition === "manual",
      });
      if (c.kind !== "wipe" && c.kind !== "hard") return;
      e.preventDefault();
      e.stopPropagation();
      begin(c.path, c.kind === "hard", { x: e.clientX / window.innerWidth || 0.5, y: e.clientY / window.innerHeight || 0.5 });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [begin]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      wipe.current?.dispose();
      wipe.current = null;
    },
    [],
  );

  const api = useMemo(() => ({ go }), [go]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div ref={overlay} aria-hidden="true" className="fixed inset-0 z-[90]" style={{ display: "none", cursor: "progress" }}>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        <div ref={label} className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ opacity: 0 }}>
          <div className="font-data text-[13px] tracking-[0.42em] text-nc-hi">
            VE<span className="text-nc-cyan">SYN</span>
          </div>
          <div className="h-px w-16 bg-nc-cyan/60" />
          <div data-dest-label className="font-data text-[10px] tracking-[0.4em] text-nc-mid" />
        </div>
      </div>
    </Ctx.Provider>
  );
}
