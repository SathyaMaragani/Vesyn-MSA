"use client";

// Stage 1: the cinematic entry. A scroll-locked viewport: wheel / touch / keys
// move a progress value 0..1, and everything - camera, lights, doors, text - is a
// function of it (see timeline.ts). It is a staged introduction; it does not talk
// to the backend and says so on screen. The lab beyond the doors is the SAME 3D
// world the real /lab renders, so entering it is a continuation, not a cut.
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { createLabWorld, type LabWorld, type WorldState } from "@/components/world/labWorld";
import { useThreeStage } from "@/components/world/useThreeStage";
import { WORKFLOW_ORDER } from "@/lib/events/presentation";
import {
  INIT_LINES,
  READY_THRESHOLD,
  cameraAt,
  clamp01,
  corePower,
  corridorPower,
  doorOpen,
  initBlockOpacity,
  initLinesShown,
  openingOpacity,
  readyOpacity,
  rosterOpacity,
  stationPower,
  titleOpacity,
} from "./timeline";

const ROSTER = ["PLANNER", "RESEARCH", "RETROSYNTHESIS", "VALIDATOR", "CRITIC", "REPLANNER", "EVALUATOR"];
const RIBS = 12;
const CORRIDOR_NEAR = 22;
const CORRIDOR_FAR = 66;
const CYAN = new THREE.Color(0x7dd3fc);
const OFF = new THREE.Color(0x0b1116);

const setOpacity = (el: HTMLElement | null, v: number) => {
  if (!el) return;
  el.style.opacity = v.toFixed(3);
  el.style.visibility = v < 0.01 ? "hidden" : "visible";
};

export function AirlockExperience() {
  const router = useRouter();
  const target = useRef(0); // where input wants progress to be
  const progress = useRef(0); // smoothed, what the scene shows
  const worldRef = useRef<LabWorld | null>(null);
  const [ready, setReady] = useState(false);
  const [entering, setEntering] = useState(false);
  const enteringRef = useRef(false);
  const enterAt = useRef(0);

  const title = useRef<HTMLDivElement>(null);
  const init = useRef<HTMLDivElement>(null);
  const initLines = useRef<(HTMLLIElement | null)[]>([]);
  const opening = useRef<HTMLDivElement>(null);
  const roster = useRef<HTMLDivElement>(null);
  const rosterItems = useRef<(HTMLLIElement | null)[]>([]);
  const readyBlock = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const enterLab = () => {
    if (enteringRef.current) return;
    enteringRef.current = true;
    enterAt.current = performance.now();
    setEntering(true);
    window.setTimeout(() => router.push("/lab"), 650);
  };
  const enterRef = useRef(enterLab);
  enterRef.current = enterLab;

  useEffect(() => {
    router.prefetch("/lab");
  }, [router]);

  // Input: wheel, touch drag, keyboard.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nudge = (d: number) => {
      target.current = clamp01(target.current + d);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      nudge((e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY) * 0.00085);
    };
    let lastY: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || lastY === null) return;
      nudge((lastY - e.clientY) * 0.0035);
      lastY = e.clientY;
    };
    const onUp = () => {
      lastY = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        nudge(e.key === "PageDown" || e.key === " " ? 0.1 : 0.04);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        nudge(e.key === "PageUp" ? -0.1 : -0.04);
      } else if (e.key === "Home") target.current = 0;
      else if (e.key === "End") target.current = 1;
      else if (e.key === "Enter" && progress.current >= READY_THRESHOLD) enterRef.current();
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // 3D pieces the frame loop animates.
  const parts = useRef<{
    ribs: THREE.InstancedMesh;
    leftDoor: THREE.Group;
    rightDoor: THREE.Group;
    spill: THREE.PointLight;
    stripMat: THREE.MeshBasicMaterial;
    emblemMat: THREE.MeshBasicMaterial;
    look: THREE.Vector3;
  } | null>(null);

  const { containerRef, failed } = useThreeStage({
    background: 0x030507,
    fogDensity: 0.022,
    fov: 50,
    setup: ({ scene, camera }) => {
      const world = createLabWorld();
      worldRef.current = world;
      scene.add(world.root);

      const dark = new THREE.MeshStandardMaterial({ color: 0x0d131a, roughness: 0.75, metalness: 0.5 });
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x141c25, roughness: 0.5, metalness: 0.7 });
      const len = CORRIDOR_FAR - CORRIDOR_NEAR;
      const midZ = (CORRIDOR_FAR + CORRIDOR_NEAR) / 2;
      const W = 7;
      const H = 4.6;

      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        scene.add(m);
        return m;
      };
      // corridor shell
      add(new THREE.BoxGeometry(W + 1, 0.3, len), dark, 0, -0.15, midZ);
      add(new THREE.BoxGeometry(W + 1, 0.3, len), dark, 0, H + 0.15, midZ);
      add(new THREE.BoxGeometry(0.3, H + 0.6, len), dark, -W / 2 - 0.15, H / 2, midZ);
      add(new THREE.BoxGeometry(0.3, H + 0.6, len), dark, W / 2 + 0.15, H / 2, midZ);
      // far end cap behind the camera's start
      add(new THREE.BoxGeometry(W + 1, H + 0.6, 0.4), dark, 0, H / 2, CORRIDOR_FAR + 0.2);

      // light strips (ceiling + floor edges): colour ramps with power
      const stripMat = new THREE.MeshBasicMaterial({ color: OFF });
      const stripGeo = new THREE.BoxGeometry(0.08, 0.05, len);
      for (const [x, y] of [[-1.2, H - 0.05], [1.2, H - 0.05], [-W / 2 + 0.05, 0.08], [W / 2 - 0.05, 0.08]] as const) add(stripGeo, stripMat, x, y, midZ);

      // ribs: one InstancedMesh; each rib is a bright bar on the wall that lights in sequence
      const ribGeo = new THREE.BoxGeometry(0.1, H - 0.6, 0.35);
      const ribs = new THREE.InstancedMesh(ribGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), RIBS * 2);
      const d = new THREE.Object3D();
      for (let i = 0; i < RIBS; i++) {
        const z = CORRIDOR_FAR - 2 - (i * (len - 5)) / (RIBS - 1);
        for (const [k, x] of [[0, -W / 2 + 0.05], [1, W / 2 - 0.05]] as const) {
          d.position.set(x, H / 2, z);
          d.updateMatrix();
          ribs.setMatrixAt(i * 2 + k, d.matrix);
          ribs.setColorAt(i * 2 + k, OFF);
        }
      }
      ribs.instanceMatrix.needsUpdate = true;
      ribs.frustumCulled = false;
      scene.add(ribs);

      // bulkhead + header hide the door pockets and frame the opening
      add(new THREE.BoxGeometry(3.4, H + 0.6, 1.0), dark, -W / 2 - 1.5, H / 2, CORRIDOR_NEAR + 0.7);
      add(new THREE.BoxGeometry(3.4, H + 0.6, 1.0), dark, W / 2 + 1.5, H / 2, CORRIDOR_NEAR + 0.7);
      add(new THREE.BoxGeometry(W + 0.2, 0.7, 1.0), dark, 0, H + 0.2, CORRIDOR_NEAR + 0.5);

      // doors: two panels with a half-ring emblem that closes into a circle
      const emblemMat = new THREE.MeshBasicMaterial({ color: OFF });
      const makeDoor = (side: -1 | 1) => {
        const g = new THREE.Group();
        const panel = new THREE.Mesh(new THREE.BoxGeometry(W / 2, H, 0.45), panelMat);
        panel.position.set(-side * (W / 4), H / 2, 0);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.06, H, 0.5), stripMat);
        edge.position.set(0, H / 2, 0);
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 8, 48, Math.PI), emblemMat);
        arc.position.set(0, H / 2, 0.25);
        arc.rotation.z = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        g.add(panel, edge, arc);
        g.position.set(side * 0, 0, CORRIDOR_NEAR);
        scene.add(g);
        return g;
      };
      const leftDoor = makeDoor(-1);
      const rightDoor = makeDoor(1);

      // light spilling from the lab as the doors open
      const spill = new THREE.PointLight(0x9be7ff, 0, 34);
      spill.position.set(0, 3.2, CORRIDOR_NEAR - 3);
      scene.add(spill);

      const look = new THREE.Vector3();
      const c0 = cameraAt(0);
      camera.position.set(...c0.pos);
      look.set(...c0.look);
      camera.lookAt(look);
      parts.current = { ribs, leftDoor, rightDoor, spill, stripMat, emblemMat, look };

      return () => {
        world.dispose();
        worldRef.current = null;
        parts.current = null;
      };
    },
    frame: ({ camera }, t, dt) => {
      const p3 = parts.current;
      const world = worldRef.current;
      if (!p3 || !world) return;

      // smooth the input into progress
      progress.current += (target.current - progress.current) * Math.min(1, dt * 4.5);
      if (Math.abs(target.current - progress.current) < 0.0004) progress.current = target.current;
      const p = progress.current;

      // camera
      const cam = cameraAt(p);
      camera.position.set(...cam.pos);
      p3.look.set(...cam.look);
      // a whisper of drift so the frame never feels frozen
      camera.position.x += Math.sin(t * 0.5) * 0.04;
      camera.position.y += Math.cos(t * 0.4) * 0.03;
      camera.lookAt(p3.look);

      // corridor lights sweep toward the doors
      const cp = corridorPower(p);
      const lit = cp * (RIBS + 1);
      const c = new THREE.Color();
      for (let i = 0; i < RIBS; i++) {
        const on = clamp01(lit - i);
        c.copy(OFF).lerp(CYAN, on);
        p3.ribs.setColorAt(i * 2, c);
        p3.ribs.setColorAt(i * 2 + 1, c);
      }
      if (p3.ribs.instanceColor) p3.ribs.instanceColor.needsUpdate = true;
      p3.stripMat.color.copy(OFF).lerp(CYAN, cp * 0.85);
      p3.emblemMat.color.copy(OFF).lerp(CYAN, clamp01(cp * 1.4));

      // doors
      const open = doorOpen(p);
      p3.leftDoor.position.x = -open * 3.55;
      p3.rightDoor.position.x = open * 3.55;
      p3.spill.intensity = open * 3.0;

      // the lab: the same world the real /lab renders, fed a scripted power-up
      const state: WorldState = {
        rig: (id) => {
          const i = WORKFLOW_ORDER.indexOf(id as (typeof WORKFLOW_ORDER)[number]);
          const power = i < 0 ? 0 : stationPower(p, i, WORKFLOW_ORDER.length);
          return { activity: power >= 1 ? "idle" : power > 0 ? "thinking" : "idle", busy: false, power };
        },
        selectedId: null,
        targetActive: false,
        routes: [],
        corePower: corePower(p),
      };
      world.update(state, t);

      // overlays
      setOpacity(title.current, titleOpacity(p));
      setOpacity(hint.current, titleOpacity(p));
      setOpacity(init.current, initBlockOpacity(p));
      const shown = initLinesShown(p);
      initLines.current.forEach((el, i) => el && (el.dataset.on = i < shown ? "1" : "0"));
      setOpacity(opening.current, openingOpacity(p));
      setOpacity(roster.current, rosterOpacity(p));
      rosterItems.current.forEach((el, i) => {
        if (el) el.dataset.on = stationPower(p, i, ROSTER.length) > 0.4 ? "1" : "0";
      });
      const ro = readyOpacity(p);
      setOpacity(readyBlock.current, ro);
      if (readyBlock.current) readyBlock.current.style.pointerEvents = p >= READY_THRESHOLD ? "auto" : "none";
      if (bar.current) bar.current.style.transform = `scaleY(${p.toFixed(4)})`;
      if (p >= READY_THRESHOLD !== ready) setReady(p >= READY_THRESHOLD);

      // the fade into /lab
      if (fade.current) {
        const k = enteringRef.current ? clamp01((performance.now() - enterAt.current) / 600) : 0;
        fade.current.style.opacity = k.toFixed(3);
        if (enteringRef.current) camera.position.z -= k * 1.2; // one last push forward
      }
    },
  });

  if (failed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-nc-base text-center">
        <div className="font-data text-xs text-nc-warn">WebGL is unavailable, so the cinematic entry cannot play.</div>
        <Link href="/lab" className="border border-nc-cyan/60 px-4 py-2 font-data text-xs uppercase tracking-wider text-nc-cyan hover:bg-nc-cyan/10">
          Enter the lab
        </Link>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="fixed inset-0 select-none overflow-hidden bg-[#030507] text-nc-hi" style={{ touchAction: "none" }}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(3,5,7,0.75)_100%)]" />

      {/* Frame 0 */}
      <div ref={title} className="pointer-events-none absolute inset-x-0 top-[26%] text-center">
        <h1 className="font-data text-6xl font-light tracking-[0.35em] text-nc-hi">
          VE<span className="text-nc-cyan">syn</span>
        </h1>
        <p className="mt-4 font-data text-sm tracking-[0.5em] text-nc-mid">AI SCIENTIFIC WORKFORCE</p>
      </div>
      <div ref={hint} className="pointer-events-none absolute inset-x-0 bottom-14 text-center">
        <p className="nc-pulse font-data text-[11px] tracking-[0.4em] text-nc-mid">SCROLL TO ENTER</p>
        <div className="mx-auto mt-3 h-8 w-px bg-gradient-to-b from-nc-cyan/70 to-transparent" />
      </div>

      {/* Frame 1: staged initialisation */}
      <div ref={init} className="pointer-events-none absolute bottom-24 left-10" style={{ opacity: 0 }}>
        <div className="nc-label mb-2">Facility initialisation</div>
        <ul className="space-y-1.5">
          {INIT_LINES.map((l, i) => (
            <li
              key={l}
              ref={(el) => {
                initLines.current[i] = el;
              }}
              data-on="0"
              className="flex items-center gap-2 font-data text-[12px] tracking-[0.2em] text-nc-lo transition-colors duration-300 data-[on='1']:text-nc-hi"
            >
              <span className="text-nc-lo transition-colors duration-300 [li[data-on='1']_&]:text-nc-ok">●</span>
              {l}
            </li>
          ))}
        </ul>
      </div>

      {/* Frame 2 */}
      <div ref={opening} className="pointer-events-none absolute inset-x-0 top-[18%] text-center" style={{ opacity: 0 }}>
        <p className="font-data text-[11px] tracking-[0.5em] text-nc-cyan">AIRLOCK · SEAL RELEASED</p>
      </div>

      {/* Frame 4: the workforce powers up */}
      <div ref={roster} className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2" style={{ opacity: 0 }}>
        <div className="nc-label mb-2 text-right">Scientific workforce</div>
        <ul className="space-y-1.5 text-right">
          {ROSTER.map((r, i) => (
            <li
              key={r}
              ref={(el) => {
                rosterItems.current[i] = el;
              }}
              data-on="0"
              className="font-data text-[12px] tracking-[0.25em] text-nc-lo/40 transition-colors duration-500 data-[on='1']:text-nc-hi"
            >
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Frame 5: ready */}
      <div ref={readyBlock} className="absolute inset-x-0 bottom-[12%] text-center" style={{ opacity: 0, pointerEvents: "none" }}>
        <p className="font-data text-[11px] tracking-[0.5em] text-nc-mid">VESYN RESEARCH FACILITY</p>
        <p className="mt-2 font-data text-lg tracking-[0.3em] text-nc-hi">SCIENTIFIC WORKFORCE READY</p>
        <button
          type="button"
          onClick={enterLab}
          disabled={!ready || entering}
          className="nc-focus mt-6 border border-nc-cyan/70 bg-nc-cyan/[0.06] px-8 py-3 font-data text-sm tracking-[0.35em] text-nc-cyan shadow-[0_0_30px_-8px_rgb(34_211_238/0.6)] transition hover:bg-nc-cyan/15"
        >
          ENTER THE LAB →
        </button>
      </div>

      {/* progress rail + skip + honesty note */}
      <div className="pointer-events-none absolute right-4 top-1/2 h-40 w-px -translate-y-1/2 bg-nc-line-strong">
        <div ref={bar} className="h-full origin-top bg-nc-cyan" style={{ transform: "scaleY(0)" }} />
      </div>
      <Link href="/lab" className="nc-focus absolute right-5 top-4 font-data text-[10px] uppercase tracking-[0.25em] text-nc-lo hover:text-nc-mid">
        Skip intro →
      </Link>
      <p className="pointer-events-none absolute bottom-3 right-5 max-w-sm text-right font-data text-[9px] uppercase tracking-[0.18em] text-nc-lo/70">
        Cinematic introduction — the indicators shown here are staged, not live system status.
      </p>

      <div ref={fade} className="pointer-events-none absolute inset-0 bg-[#030507]" style={{ opacity: 0 }} />
    </div>
  );
}
