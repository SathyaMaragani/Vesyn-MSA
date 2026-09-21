"use client";

import React, { useEffect, useRef } from "react";
import type { HeroBus } from "./heroBus";
import type { HeroFacts } from "./heroWorld";
import { CHAPTERS, chapterAt, dialAngle, identityOpacity, seg, smooth } from "./journey";
import { useBusFrame } from "./useBusFrame";

const SIZE = 340; // CSS px of the drawing surface; the element scales with the viewport
const TICKS = Array.from({ length: 72 }, (_, i) => i);

const f2 = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1).padStart(4, "0");

/**
 * The molecular analysis instrument. It is a plan view (looking down the structure's y axis) of the
 * molecule itself: every bond and atom is drawn, turned by the molecule's own rotation. The amber
 * line is the bond path the camera rides; the amber marker IS the camera - its real position in the
 * structure's frame, with the direction it is looking - clamped to the rim while it is still far
 * outside. The scale ring turns with the scroll. Nothing on it is decorative: it reads the same bus
 * the 3D scene writes.
 */
export function Instrument({ bus, facts }: { bus: HeroBus; facts: HeroFacts | null }) {
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const ring = useRef<SVGSVGElement>(null);
  const read = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = map.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;
  }, []);

  useBusFrame(
    bus,
    (b) => {
      const el = root.current;
      if (!el || !facts) return;
      // present from the opening; it steps back once the identity is revealed
      el.style.opacity = String(smooth(seg(b.intro, 0.4, 1)) * (1 - 0.42 * identityOpacity(b.progress)));
      if (ring.current) ring.current.style.transform = `rotate(${dialAngle(b.progress).toFixed(2)}deg)`;

      const cv = map.current;
      const g = cv?.getContext("2d");
      if (cv && g) {
        const dpr = cv.width / SIZE;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, SIZE, SIZE);
        const c = SIZE / 2;
        const R = c - 8;
        const k = (R * 0.8) / 13; // scene units -> px
        const th = (-b.rotY * Math.PI) / 180;
        const cs = Math.cos(th);
        const sn = Math.sin(th);
        // plan view: x across, z down the page, turned with the molecule
        const P = (x: number, z: number): [number, number] => [c + (x * cs - z * sn) * k, c + (x * sn + z * cs) * k];
        const L = facts.layout;

        g.lineWidth = 1;
        g.strokeStyle = "rgba(232,228,216,0.34)";
        g.beginPath();
        for (const [a, bb] of L.bonds) {
          const [x1, y1] = P(L.atoms[a][0], L.atoms[a][2]);
          const [x2, y2] = P(L.atoms[bb][0], L.atoms[bb][2]);
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
        }
        g.stroke();
        // the camera's rail
        g.strokeStyle = "rgba(214,164,91,0.85)";
        g.lineWidth = 1.4;
        g.beginPath();
        L.path.forEach((p, i) => {
          const [x, y] = P(p[0], p[2]);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.stroke();
        g.fillStyle = "rgba(232,228,216,0.75)";
        for (const a of L.atoms) {
          const [x, y] = P(a[0], a[2]);
          g.beginPath();
          g.arc(x, y, 1.7, 0, Math.PI * 2);
          g.fill();
        }
        // the atom nearest the camera
        const na = L.atoms[b.nearest.index];
        if (na) {
          const [x, y] = P(na[0], na[2]);
          g.strokeStyle = "rgba(143,175,154,0.95)";
          g.lineWidth = 1.2;
          g.beginPath();
          g.arc(x, y, 6, 0, Math.PI * 2);
          g.stroke();
        }
        // the camera itself
        let [mx, my] = P(b.local.x, b.local.z);
        const dx = mx - c;
        const dy = my - c;
        const dist = Math.hypot(dx, dy);
        const outside = dist > R - 12;
        if (outside) {
          mx = c + (dx / dist) * (R - 12);
          my = c + (dy / dist) * (R - 12);
        }
        const [lx, ly] = P(b.lookLocal.x, b.lookLocal.z);
        const [cx0, cy0] = P(b.local.x, b.local.z);
        const ang = Math.atan2(ly - cy0, lx - cx0);
        g.save();
        g.translate(mx, my);
        g.rotate(ang);
        g.fillStyle = outside ? "rgba(214,164,91,0.7)" : "rgba(214,164,91,1)";
        g.beginPath();
        g.moveTo(9, 0);
        g.lineTo(-6, 5);
        g.lineTo(-3, 0);
        g.lineTo(-6, -5);
        g.closePath();
        g.fill();
        g.restore();
        // sight line to what it is looking at
        g.setLineDash([2, 4]);
        g.strokeStyle = "rgba(214,164,91,0.45)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(mx, my);
        g.lineTo(mx + Math.cos(ang) * 46, my + Math.sin(ang) * 46);
        g.stroke();
        g.setLineDash([]);
      }

      if (read.current) {
        const ch = CHAPTERS[chapterAt(b.progress)];
        read.current.textContent = `STATE  ${ch.id} · ${ch.label}\nCAM  ${f2(b.local.x / L0(facts))}  ${f2(b.local.y / L0(facts))}  ${f2(b.local.z / L0(facts))}\nNEAREST  C${String(b.nearest.index + 1).padStart(2, "0")} · ${b.nearest.bl.toFixed(1)} BL\nTURN  ${f2(b.rotY).replace("+", "+ ")}°`;
      }
    },
    30,
  );

  return (
    <div
      ref={root}
      className="pointer-events-auto absolute bottom-[clamp(20px,6vh,64px)] right-[clamp(20px,2.6vw,44px)] w-[clamp(190px,17.5vw,340px)]"
      style={{ opacity: 0 }}
      data-cursor="explore"
      data-cursor-label="EXPLORE"
    >
      <div className="relative aspect-square w-full">
        {/* scale ring: turns with the scroll */}
        <svg ref={ring} viewBox="0 0 340 340" className="absolute inset-0 h-full w-full will-change-transform" fill="none" aria-hidden>
          {TICKS.map((i) => {
            const major = i % 6 === 0;
            return <line key={i} x1="170" y1="4" x2="170" y2={major ? 15 : 9} stroke="rgb(232 228 216)" strokeOpacity={major ? 0.75 : 0.35} strokeWidth={major ? 1.4 : 1} transform={`rotate(${i * 5} 170 170)`} />;
          })}
          {[0, 90, 180, 270].map((d) => (
            <text key={d} x="170" y="30" textAnchor="middle" fontSize="9" letterSpacing="2" fill="rgb(169 167 156)" fillOpacity="0.85" fontFamily="var(--nc-font-data)" transform={`rotate(${d} 170 170)`}>
              {String(d).padStart(3, "0")}
            </text>
          ))}
        </svg>
        {/* fixed frame: outer ring, a dashed inner ring, and the copper index mark */}
        <svg viewBox="0 0 340 340" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
          <circle cx="170" cy="170" r="166" stroke="rgb(232 228 216)" strokeOpacity="0.28" />
          <circle cx="170" cy="170" r="122" stroke="rgb(143 175 154)" strokeOpacity="0.3" strokeDasharray="1 6" />
          <circle cx="170" cy="170" r="60" stroke="rgb(232 228 216)" strokeOpacity="0.1" />
          <path d="M170 0 l5 -9 h-10 z" fill="rgb(184 117 82)" />
        </svg>
        <canvas ref={map} className="absolute inset-0 h-full w-full" aria-label="Plan view of the molecule with the camera's position" />
      </div>
      <div ref={read} className="mt-3 whitespace-pre text-right font-data text-[9px] leading-[1.9] tracking-[0.22em] text-nc-mid" />
    </div>
  );
}

/** Coordinates are shown in bond lengths, so they mean something about the molecule. */
function L0(f: HeroFacts): number {
  return f.layout.bondLength || 1;
}
