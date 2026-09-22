"use client";

import React, { useEffect, useRef } from "react";

type Mode = "idle" | "explore" | "interact" | "inspect" | "enter" | "text" | "drag";

const RING: Record<Mode, { size: number; alpha: number }> = {
  idle: { size: 26, alpha: 0 }, // a crosshair and a dot; the ring appears only when there is something to act on
  explore: { size: 46, alpha: 0.7 },
  interact: { size: 56, alpha: 0.9 },
  inspect: { size: 66, alpha: 0.95 },
  enter: { size: 84, alpha: 1 },
  text: { size: 4, alpha: 0.9 },
  drag: { size: 46, alpha: 0.75 },
};

function modeOf(el: Element | null): { mode: Mode; label: string } {
  if (!el) return { mode: "idle", label: "" };
  const tagged = el.closest("[data-cursor]") as HTMLElement | null;
  // an interactive child wins over an ambient parent (a link inside the hero is INTERACT, not EXPLORE)
  if (el.closest("[data-cta]")) return { mode: "enter", label: "ENTER" };
  if (tagged && tagged.dataset.cursor !== "idle" && !(tagged.dataset.cursor === "explore" && el.closest("a[href], button") && !tagged.matches("a[href], button, [role=button]"))) {
    return { mode: (tagged.dataset.cursor as Mode) ?? "idle", label: tagged.dataset.cursorLabel ?? "" };
  }
  if (el.closest("input, textarea, select, [contenteditable=true]")) return { mode: "text", label: "" };
  if (el.closest("a[href], button, summary, [role=button], [role=tab]")) return { mode: "interact", label: "" };
  return { mode: "idle", label: "" };
}

/**
 * The site cursor: a dot that is the pointer, and a ring that trails it, stretches
 * with speed, swells over links, opens up over the primary control, becomes a caret
 * over text fields and tightens on press. Fine pointers only; the system cursor is
 * hidden only once this one is live, and always stays over form fields.
 *
 * Drawn in white with mix-blend-mode: difference, so it is the inverse of whatever
 * is under it - light over the dark lab, dark over a light panel or molecule.
 */
export function SiteCursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const cross = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia?.("(pointer: fine)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const p = { x: -100, y: -100, rx: -100, ry: -100, size: RING.idle.size, alpha: 0.5, angle: 0, stretch: 0 };
    let mode: Mode = "idle";
    let target: Element | null = null;
    let frameNo = 0;
    let pressed = false;
    let shown = false;
    let raf = 0;
    let last = performance.now();

    const setMode = (m: Mode, text: string) => {
      mode = m;
      if (label.current) label.current.textContent = text;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!shown) {
        shown = true;
        p.rx = p.x;
        p.ry = p.y;
        document.documentElement.classList.add("nc-cursor-live");
        if (dot.current) dot.current.style.opacity = "1";
        if (ring.current) ring.current.style.opacity = "1";
      }
      target = e.target as Element | null;
      refresh();
    };
    const refresh = () => {
      const m = modeOf(target);
      if (m.mode !== mode || (label.current && label.current.textContent !== m.label)) setMode(m.mode, m.label);
    };
    const onDown = () => (pressed = true);
    const onUp = () => (pressed = false);
    const onLeave = () => {
      shown = false;
      document.documentElement.classList.remove("nc-cursor-live");
      if (dot.current) dot.current.style.opacity = "0";
      if (ring.current) ring.current.style.opacity = "0";
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const follow = reduced ? 1 : 1 - Math.exp(-dt * 16);
      const px = p.rx;
      const py = p.ry;
      p.rx += (p.x - p.rx) * follow;
      p.ry += (p.y - p.ry) * follow;
      const vx = p.rx - px;
      const vy = p.ry - py;
      const speed = Math.hypot(vx, vy);
      if (speed > 0.4) p.angle = Math.atan2(vy, vx);
      p.stretch += (Math.min(0.55, speed / 26) - p.stretch) * (1 - Math.exp(-dt * 12));
      if (++frameNo % 4 === 0) refresh(); // an element under a still pointer can change (a hovered atom)
      const spec = RING[mode];
      const tSize = spec.size * (pressed ? 0.78 : 1);
      p.size += (tSize - p.size) * (1 - Math.exp(-dt * 14));
      p.alpha += (spec.alpha - p.alpha) * (1 - Math.exp(-dt * 14));

      if (cross.current) {
        cross.current.style.transform = `translate(${p.x - 12}px, ${p.y - 12}px)`;
        cross.current.style.opacity = String(shown && mode === "idle" ? 0.85 : 0);
      }
      if (dot.current) dot.current.style.transform = `translate(${p.x - 2.5}px, ${p.y - 2.5}px) scale(${mode === "text" ? 0 : mode === "enter" ? 0.4 : mode === "idle" ? 0.8 : 1})`;
      if (ring.current) {
        const s = p.size;
        ring.current.style.width = `${s}px`;
        ring.current.style.height = `${s}px`;
        ring.current.style.opacity = shown ? String(p.alpha) : "0";
        ring.current.style.borderRadius = mode === "text" ? "1px" : "9999px";
        ring.current.style.background = mode === "enter" ? "rgb(255 255 255 / 0.08)" : "transparent";
        ring.current.style.transform = `translate(${p.rx - s / 2}px, ${p.ry - s / 2}px) rotate(${p.angle}rad) scale(${1 + p.stretch}, ${1 - p.stretch * 0.35})`;
      }
      if (label.current) label.current.style.transform = `translate(${p.rx + p.size / 2 + 10}px, ${p.ry - 6}px)`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.classList.remove("nc-cursor-live");
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[100] mix-blend-difference">
      <div
        ref={ring}
        className="absolute left-0 top-0 border border-white will-change-transform"
        style={{ opacity: 0, width: RING.idle.size, height: RING.idle.size, borderRadius: 9999 }}
      />
      <div ref={cross} className="absolute left-0 top-0 h-6 w-6 will-change-transform" style={{ opacity: 0 }}>
        <svg viewBox="0 0 24 24" className="h-full w-full text-white" fill="none">
          <path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.9" />
        </svg>
      </div>
      <div ref={dot} className="absolute left-0 top-0 h-[5px] w-[5px] rounded-full bg-white will-change-transform" style={{ opacity: 0 }} />
      <div ref={label} className="absolute left-0 top-0 whitespace-nowrap font-data text-[9px] tracking-[0.3em] text-white" />
    </div>
  );
}
