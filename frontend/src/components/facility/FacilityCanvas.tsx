"use client";

// The real lab. It mounts the research facility and feeds it ONLY backend-derived state (the folded
// events and the evaluator's package). The camera is directed, not just orbited:
//   arrival     through the south entrance, to the chamber, then back and up to the overview
//   travel      every change of view is an eased arc, never a cut
//   free view   drag to orbit, right-drag / shift-drag to pan, wheel to zoom (taking the camera leaves any preset)
//   follow      goes to whichever department the backend says is working (with a dwell, so it never flickers)
// Click a department to focus it, the chamber to focus the molecule (then atoms and bonds are pickable).
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getMolecule } from "@/lib/chem/molecule";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import type { NeoEvent } from "@/types/events";
import type { KnownAgentId } from "@/types/agents";
import { useThreeStage } from "@/components/world/useThreeStage";
import { planTravel, sampleKeys, sampleTravel, type Travel } from "./cameraTravel";
import { TONE_LOOK, buildFacilityState } from "./facilityState";
import { createFacilityWorld, type FacilityWorld, type PlaceId } from "./facilityWorld";
import { ARRIVAL, CORE_POSE, FLOW, MOLECULE_POSE, OVERVIEW, ROUTE_POSE, ZONES, ZONE_LIST, zonePose, type Pose, type Vec3 } from "./layout";

const now = () => performance.now() / 1000;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const FOLLOW_DWELL = 3.2;
const ATOM_PICK_RANGE = 34;

function eventPlace(ev: NeoEvent): PlaceId | null {
  switch (ev.type) {
    case "ROUTE_GENERATED":
      return "retro";
    case "VALIDATION_STARTED":
    case "VALIDATION_COMPLETED":
      return "validator";
    case "CRITIQUE_CREATED":
      return "critic";
    case "REPLAN_STARTED":
    case "REPLAN_COMPLETED":
      return "replanner";
    case "MOLECULE_RECEIVED":
      return "core";
    case "PROJECT_COMPLETED":
      return "evaluator";
    default:
      return ev.agent_id && ev.agent_id in ZONES ? (ev.agent_id as KnownAgentId) : null;
  }
}

/** Dev-only profiling switches: /lab?skip&perf=pr1,noaa,noshadow,nopool,nolamps */
const perfFlags = (): Set<string> => (process.env.NODE_ENV !== "production" && typeof window !== "undefined" ? new Set((new URLSearchParams(window.location.search).get("perf") ?? "").split(",")) : new Set<string>());

export function FacilityCanvas() {
  const flags = useMemo(perfFlags, []);
  const { agents, run, graph, cursor, health } = useNeo();
  const result = useRunResult();
  const ui = useLabUI();

  const state = useMemo(() => buildFacilityState({ agents, run, result }), [agents, run, result]);
  const molecule = useMemo(() => {
    if (!run.target) return null;
    const r = getMolecule(run.target.canonical_smiles);
    return r.ok ? r.molecule : null;
  }, [run.target]);

  const live = useRef({ state, ui, events: run.events, cursor, molecule });
  live.current = { state, ui, events: run.events, cursor, molecule };

  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const worldRef = useRef<FacilityWorld | null>(null);
  const cur = useRef({ pos: new THREE.Vector3(...OVERVIEW.pos), look: new THREE.Vector3(...OVERVIEW.look) });
  const travel = useRef<Travel | null>(null);
  const arrival = useRef({ tt: 0, done: false });
  const hoverRef = useRef<PlaceId | null>(null);
  const dragging = useRef(false);
  const follow = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const evPtr = useRef(0);
  const quality = useRef({ scale: 1, avg: 1 / 60, since: 0, frames: 0 });

  const goTo = (pose: Pose) => {
    arrival.current.done = true;
    travel.current = planTravel({ pos: [cur.current.pos.x, cur.current.pos.y, cur.current.pos.z], look: [cur.current.look.x, cur.current.look.y, cur.current.look.z] }, pose, now());
  };

  // The view the user chose -> where the camera travels. (Follow is handled per frame, with a dwell.)
  useEffect(() => {
    if (ui.mode === "follow" || !arrival.current.done) return;
    let pose: Pose | null = null;
    const f = ui.focus;
    if (f?.kind === "agent" && f.id in ZONES) pose = zonePose(f.id as KnownAgentId);
    else if (f?.kind === "core") pose = CORE_POSE;
    else if (f?.kind === "molecule") pose = MOLECULE_POSE;
    else if (f?.kind === "route") pose = ROUTE_POSE;
    else if (ui.preset === "overview") pose = OVERVIEW;
    else if (ui.preset === "flow") pose = FLOW;
    if (pose) goTo(pose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.mode, ui.focus, ui.preset]);

  useEffect(() => {
    if (ui.mode !== "follow") follow.current.id = null;
    else arrival.current.done = true;
  }, [ui.mode]);

  // History is not replayed as impulses: only events that arrive while the lab is open (and live) flash.
  useEffect(() => {
    evPtr.current = run.events.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId]);

  useEffect(() => {
    worldRef.current?.setEdges(graph?.edges ?? []);
  }, [graph]);
  useEffect(() => {
    worldRef.current?.core.setAtomHighlight(ui.selectedAtom);
  }, [ui.selectedAtom, molecule]);
  useEffect(() => {
    worldRef.current?.core.setBondHighlight(ui.selectedBond);
  }, [ui.selectedBond, molecule]);

  // keyboard: 1-7 focus a department, O overview, M molecule, R route, F follow, Esc back to the overview
  useEffect(() => {
    const ORDER: KnownAgentId[] = ["planner", "research", "retro", "validator", "critic", "replanner", "evaluator"];
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const u = live.current.ui;
      arrival.current.done = true;
      const n = Number(e.key);
      if (n >= 1 && n <= 7) u.focusAgent(ORDER[n - 1]);
      else if (e.key === "0" || e.key === "o" || e.key === "O") u.setPreset("overview");
      else if (e.key === "m" || e.key === "M") u.focusMolecule();
      else if (e.key === "r" || e.key === "R") u.focusRoute();
      else if (e.key === "f" || e.key === "F") u.setMode(u.mode === "follow" ? "free" : "follow");
      else if (e.key === "Escape") u.setPreset("overview");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { containerRef, failed } = useThreeStage({
    background: 0x0f100e,
    fogDensity: 0.0078,
    fov: 40,
    maxPixelRatio: flags.has("pr1") ? 1 : 1.5,
    antialias: !flags.has("noaa"),
    shadows: !flags.has("noshadow"),
    setup: ({ renderer, scene, camera, canvas }) => {
      const world = createFacilityWorld({ shadows: !flags.has("noshadow") });
      if (flags.has("nopool")) world.root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && m.blending === THREE.AdditiveBlending) o.visible = false; });
      if (flags.has("nolamps")) world.root.traverse((o) => { if ((o as THREE.PointLight).isPointLight) o.visible = false; });
      worldRef.current = world;
      scene.add(world.root);
      world.setEdges(graph?.edges ?? []);
      world.core.setMolecule(live.current.molecule);
      // The shadow map is rendered once and refreshed a few times a second: the building never moves, and
      // the slow moving parts (gantry, task orbit, carriage) do not need a fresh shadow every frame.
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      camera.near = 0.3;
      camera.far = 320;
      camera.updateProjectionMatrix();
      if (process.env.NODE_ENV !== "production") (window as unknown as { __facility?: unknown }).__facility = { world, camera, renderer, scene, cur: cur.current, goTo };

      // soft studio reflections: what lets the brushed metal and the glass read
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.5;
      renderer.toneMappingExposure = 1.18;

      evPtr.current = live.current.events.length;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const skip = new URLSearchParams(window.location.search).has("skip");
      if (reduced || skip) {
        arrival.current.done = true;
        cur.current.pos.set(...OVERVIEW.pos);
        cur.current.look.set(...OVERVIEW.look);
        world.setPower(1);
        live.current.ui.setArrived(true);
      } else {
        const k0 = ARRIVAL[0].pose;
        cur.current.pos.set(...k0.pos);
        cur.current.look.set(...k0.look);
        world.setPower(0.05);
      }
      camera.position.copy(cur.current.pos);
      camera.lookAt(cur.current.look);

      // ---- pointer: orbit / pan / zoom / hover / pick -----------------------------------------------------------
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let drag: "orbit" | "pan" | null = null;
      let moved = 0;
      let last = { x: 0, y: 0 };
      const setNdc = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
      };
      const zoneAt = (): PlaceId | null => {
        const hit = ray.intersectObjects(world.hitTargets, false)[0];
        return hit ? ((hit.object.userData.zone as PlaceId) ?? null) : null;
      };
      const near = () => camera.position.distanceTo(world.core.moleculeAnchor) < ATOM_PICK_RANGE;
      const takeCamera = () => {
        arrival.current.done = true;
        travel.current = null;
        live.current.ui.goFree();
      };
      const down = (e: PointerEvent) => {
        drag = e.button === 2 || e.shiftKey ? "pan" : "orbit";
        moved = 0;
        last = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
        if (!arrival.current.done) arrival.current.done = true;
      };
      const move = (e: PointerEvent) => {
        if (!drag) {
          setNdc(e);
          let h = zoneAt();
          if (near() && world.core.pickAtom(ray) !== null) h = "core";
          hoverRef.current = h;
          canvas.style.cursor = h ? "pointer" : "grab";
          const el = containerRef.current;
          if (el) {
            el.dataset.cursor = h ? "inspect" : "drag";
            el.dataset.cursorLabel = h ? "INSPECT" : "DRAG";
          }
          return;
        }
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        last = { x: e.clientX, y: e.clientY };
        if (moved > 5 && !dragging.current) {
          dragging.current = true;
          takeCamera();
        }
        if (!dragging.current) return;
        const c = cur.current;
        const offset = c.pos.clone().sub(c.look);
        if (drag === "orbit") {
          const radius = offset.length();
          const theta = Math.atan2(offset.x, offset.z) - dx * 0.006;
          const phi = Math.min(1.5, Math.max(0.08, Math.acos(Math.min(1, Math.max(-1, offset.y / radius))) + dy * 0.006));
          c.pos.set(c.look.x + radius * Math.sin(phi) * Math.sin(theta), c.look.y + radius * Math.cos(phi), c.look.z + radius * Math.sin(phi) * Math.cos(theta));
        } else {
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
          const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 2).setY(0).normalize();
          const k = Math.max(0.02, offset.length() * 0.0016);
          const shift = right.multiplyScalar(-dx * k).addScaledVector(forward, -dy * k);
          c.pos.add(shift);
          c.look.add(shift);
        }
      };
      const up = (e: PointerEvent) => {
        const wasDrag = dragging.current;
        drag = null;
        dragging.current = false;
        canvas.style.cursor = "grab";
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (wasDrag || moved >= 5) return;
        setNdc(e);
        const u = live.current.ui;
        const focused = u.focus?.kind === "core" || u.focus?.kind === "molecule";
        if (near() && (focused || camera.position.distanceTo(world.core.moleculeAnchor) < 20)) {
          const atom = world.core.pickAtom(ray);
          if (atom !== null) return void u.selectAtom(atom);
          const bond = world.core.pickBond(ray);
          if (bond !== null) return void u.selectBond(bond);
        }
        const z = zoneAt();
        if (z === "core") {
          u.selectAtom(null);
          u.selectBond(null);
          u.focusMolecule();
        } else if (z) u.focusAgent(z);
        else {
          u.selectAtom(null);
          u.selectBond(null);
          u.select(null);
        }
      };
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        takeCamera();
        const c = cur.current;
        const offset = c.pos.clone().sub(c.look);
        offset.setLength(Math.min(140, Math.max(5, offset.length() * (1 + e.deltaY * 0.0011))));
        c.pos.copy(c.look).add(offset);
      };
      const noMenu = (e: Event) => e.preventDefault();
      canvas.style.cursor = "grab";
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("wheel", wheel, { passive: false });
      canvas.addEventListener("contextmenu", noMenu);

      return () => {
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("wheel", wheel);
        canvas.removeEventListener("contextmenu", noMenu);
        envRT.dispose();
        pmrem.dispose();
        world.dispose();
        worldRef.current = null;
      };
    },
    frame: ({ camera, size, renderer }, t, dt) => {
      const world = worldRef.current;
      if (!world) return;

      // refresh the static shadow map a few times a second
      if (++quality.current.frames % 20 === 0) renderer.shadowMap.needsUpdate = true;
      // Adaptive resolution: the facility must stay interactive on integrated GPUs. If the frame time stays
      // over ~34 ms the render scale steps down (never below 0.7); if it is comfortably under ~19 ms it steps back up.
      {
        const q = quality.current;
        q.avg += (Math.min(dt, 0.2) - q.avg) * 0.04;
        const tNow = performance.now();
        if (tNow - q.since > 2500 && t > 3 && !flags.has("noscale")) {
          const dpr = Math.min(window.devicePixelRatio, 1.5);
          let next = q.scale;
          if (q.avg > 0.036 && q.scale > 0.7) next = Math.max(0.7, q.scale - 0.1);
          else if (q.avg < 0.02 && q.scale < 1) next = Math.min(1, q.scale + 0.1);
          if (next !== q.scale) {
            q.scale = next;
            const s = size();
            renderer.setPixelRatio(dpr * next);
            renderer.setSize(s.width, s.height);
          }
          q.since = tNow;
        }
      }
      const { state: fs, ui: u, events, cursor: replay } = live.current;
      const clock = now();

      // ---- live events -> impulses (never while replaying, never for history) -----------------------------
      if (replay !== null || events.length < evPtr.current) evPtr.current = events.length;
      for (; evPtr.current < events.length; evPtr.current++) {
        const ev = events[evPtr.current];
        if (ev.type === "MESSAGE_SENT" && ev.agent_id) world.packet(ev.agent_id, ev.data.to);
        else if (ev.type !== "TOOL_REQUESTED" && ev.type !== "TASK_CREATED" && ev.type !== "TASK_ASSIGNED") {
          const p = eventPlace(ev);
          if (p) world.flash(p);
          if (ev.type === "PROJECT_COMPLETED") world.flash("core");
        }
      }

      // ---- the camera ---------------------------------------------------------------------------------------
      const arr = arrival.current;
      if (!arr.done) {
        // The cinematic runs on frame deltas, clamped: a shader-compile hitch on the first frames must not eat it.
        // (It also waits out three warm-up frames before it starts.)
        if (quality.current.frames > 3) arr.tt += Math.min(dt, 0.05);
        const tt = arr.tt;
        const last = ARRIVAL[ARRIVAL.length - 1].at;
        const p = sampleKeys(ARRIVAL, tt);
        cur.current.pos.set(...p.pos);
        cur.current.look.set(...p.look);
        world.setPower(smooth(tt / 3.4) * 0.95 + 0.05);
        if (tt > 4.4 && !u.arrived) u.setArrived(true);
        if (tt >= last) {
          arr.done = true;
          world.setPower(1);
        }
      } else {
        world.setPower(1);
        // follow: go where the backend says the work is, no more often than the dwell allows
        if (u.mode === "follow") {
          const want = fs.activeId;
          if (want && want !== follow.current.id && clock - follow.current.at > FOLLOW_DWELL) {
            follow.current = { id: want, at: clock };
            goTo(zonePose(want));
          }
        }
        if (travel.current && !dragging.current) {
          const s = sampleTravel(travel.current, clock);
          cur.current.pos.set(...s.pose.pos);
          cur.current.look.set(...s.pose.look);
          if (s.done) travel.current = null;
        }
      }
      camera.position.copy(cur.current.pos);
      // a very small, slow drift once the camera has settled, so the room is never dead still
      if (!travel.current && arr.done && !dragging.current) {
        const k = Math.min(1, cur.current.pos.distanceTo(cur.current.look) / 30) * 0.006;
        camera.position.x += Math.sin(t * 0.11) * cur.current.pos.distanceTo(cur.current.look) * k;
        camera.position.y += Math.sin(t * 0.09 + 1) * cur.current.pos.distanceTo(cur.current.look) * k * 0.5;
      }
      camera.lookAt(cur.current.look);
      if (!u.arrived && arr.done) u.setArrived(true);

      // ---- the world ----------------------------------------------------------------------------------------
      const selected: PlaceId | null = u.focus?.kind === "core" || u.focus?.kind === "molecule" ? "core" : ((u.selectedId as PlaceId | null) ?? null);
      world.update(fs, { hover: hoverRef.current, selected, cam: camera.position }, t, dt);

      // ---- labels: quiet, pinned to their departments ---------------------------------------------------------
      const { width, height } = size();
      const v = new THREE.Vector3();
      for (const zd of ZONE_LIST) {
        const el = labelRefs.current[zd.id];
        if (!el) continue;
        const rig = world.rigs.get(zd.id);
        if (!rig) continue;
        v.copy(rig.anchor).project(camera);
        const d = camera.position.distanceTo(rig.anchor);
        const inView = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.1;
        const hovered = hoverRef.current === zd.id;
        const active = fs.zones[zd.id].busy || fs.zones[zd.id].tone === "failed" || fs.zones[zd.id].tone === "warning";
        const far = smooth((d - 24) / 20);
        const cover = u.selectedId === zd.id || u.focus?.kind === "core" || u.focus?.kind === "molecule" ? 0 : 1;
        const o = inView ? cover * far * (hovered ? 1 : active ? 0.95 : 0.4) * (u.hudHidden ? 0 : 1) : 0;
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translate(${((v.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * height).toFixed(1)}px) translate(-50%, -100%)`;
      }
    },
  });

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-nc-base font-data text-xs text-nc-bad">
        WebGL is unavailable in this browser — the 3D lab cannot render. Agent state is still available in the panels.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      data-cursor="drag"
      data-cursor-label="DRAG"
    >
      {ZONE_LIST.map((zd) => {
        const z = state.zones[zd.id];
        const tone = TONE_LOOK[z.tone];
        return (
          <div
            key={zd.id}
            ref={(el) => {
              labelRefs.current[zd.id] = el;
            }}
            className="pointer-events-none absolute left-0 top-0 whitespace-nowrap opacity-0 will-change-transform"
          >
            <div className="flex items-center gap-2 font-data text-[10px] leading-none tracking-[0.22em] [text-shadow:0_0_10px_rgba(16,17,15,0.95)]">
              <span className="text-nc-lo">{zd.number}</span>
              <span className="text-nc-hi">{zd.title}</span>
              {z.tone !== "idle" && z.tone !== "dormant" && <span style={{ color: `#${tone.hex.toString(16).padStart(6, "0")}` }}>{z.activity.toUpperCase()}</span>}
            </div>
          </div>
        );
      })}
      {health === "offline" && null}
    </div>
  );
}
