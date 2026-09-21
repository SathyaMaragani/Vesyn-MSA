// The NeoChems research facility as one three.js scene graph.
//
// The world owns NO data. Every frame it is handed a FacilityState (derived from the real event fold and
// the evaluator's package) and eases toward it: departments brighten as they work, turn amber while they
// process, copper when they warn, red-copper when they fail. Live events arrive as impulses (a flash in a
// department, a packet travelling a conduit); the world never invents one.
//
// Performance: the static building is a handful of merged meshes (see kit.ts); real lights are few (a
// key with one shadow map, the core lamp and one roaming "attention" lamp); department glow is additive
// floor pools and emissive strips, not lights.
import * as THREE from "three";
import type { KnownAgentId } from "../../types/agents.ts";
import type { Molecule } from "@/lib/chem/molecule";
import { TONE_LOOK, type FacilityState, type Tone } from "./facilityState";
import { ZONES, port } from "./layout";
import { buildArchitecture } from "./architecture";
import { buildPrecinct } from "./precinct";
import { Batch, damp, glowTexture, makeMats, shaftTexture } from "./kit";
import { buildCore, buildPlanner, type CoreRig } from "./zoneCore";
import { buildCritic } from "./zoneCritic";
import { buildEvaluator } from "./zoneEvaluator";
import { buildReplanner } from "./zoneReplanner";
import { buildResearch } from "./zoneResearch";
import { buildRetro } from "./zoneRetro";
import { buildValidation } from "./zoneValidation";
import type { BuildEnv, ZoneRig } from "./zoneKit";

export type PlaceId = KnownAgentId | "core";

export interface WorldUI {
  hover: PlaceId | null;
  selected: PlaceId | null;
  /** the camera, so overhead cables can step out of its way */
  cam?: THREE.Vector3;
}

export interface Edge {
  source: string;
  target: string;
  conditional: boolean;
}

export interface FacilityWorld {
  root: THREE.Group;
  rigs: Map<PlaceId, ZoneRig>;
  core: CoreRig;
  hitTargets: THREE.Object3D[];
  setEdges: (edges: readonly Edge[]) => void;
  /** The world lights up from dark: 0 = standing lights only, 1 = fully lit. Cinematic (arrival), never state. */
  setPower: (p: number) => void;
  /** A live event happened in a department. */
  flash: (id: PlaceId) => void;
  /** A message travelled between two departments. */
  packet: (from: string, to: string) => void;
  update: (s: FacilityState, ui: WorldUI, t: number, dt: number) => void;
  dispose: () => void;
}

interface Anim {
  color: THREE.Color;
  power: number;
  flash: number;
  hover: number;
}

interface Conduit {
  a: string;
  b: string;
  curve: THREE.QuadraticBezierCurve3;
  mat: THREE.MeshBasicMaterial;
  conditional: boolean;
  level: number;
  pts: THREE.Vector3[];
}

interface Packet {
  curve: THREE.QuadraticBezierCurve3;
  t0: number;
  dur: number;
}

const MAX_PACKETS = 40;

function coreTone(s: FacilityState): Tone {
  if (!s.target) return s.awake ? "idle" : "dormant";
  if (s.phase === "completed") return "complete";
  if (s.phase === "failed") return "warning";
  return "active";
}

export function createFacilityWorld(opts: { shadows?: boolean } = {}): FacilityWorld {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const root = new THREE.Group();
  const mats = track(makeMats());
  const glow = track(glowTexture());
  const env: BuildEnv = { mats, metal: new Batch(), matte: new Batch(), glass: new Batch(), emit: new Batch(), glow, track };

  // ---- light ------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xc4c6ba, 0x24251f, 0.85);
  const key = new THREE.DirectionalLight(0xffe2b4, 3.1);
  key.position.set(-40, 58, 30);
  key.castShadow = opts.shadows !== false;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -58;
  sc.right = 58;
  sc.top = 58;
  sc.bottom = -58;
  sc.near = 10;
  sc.far = 190;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  key.shadow.radius = 3;
  const coreLamp = new THREE.PointLight(0xffe2b8, 70, 26, 1.6);
  coreLamp.position.set(0, 10, 0);
  root.add(hemi, key, key.target, coreLamp);

  // ---- the building and its departments ------------------------------------------------------------------
  const arch = buildArchitecture(env);
  root.add(arch.group);
  const precinct = buildPrecinct(env);
  root.add(precinct.group);
  const core = buildCore(env);
  const rigs = new Map<PlaceId, ZoneRig>();
  rigs.set("core", core);
  rigs.set("planner", buildPlanner(env));
  rigs.set("research", buildResearch(env));
  rigs.set("retro", buildRetro(env));
  rigs.set("validator", buildValidation(env));
  rigs.set("critic", buildCritic(env));
  rigs.set("replanner", buildReplanner(env));
  rigs.set("evaluator", buildEvaluator(env));
  for (const r of rigs.values()) root.add(r.group);

  const statics: THREE.Mesh[] = [];
  for (const [b, m, shadow] of [
    [env.metal, mats.metal, true],
    [env.matte, mats.matte, true],
    [env.glass, mats.glass, false],
    [env.emit, mats.emit, false],
  ] as [Batch, THREE.Material, boolean][]) {
    const mesh = b.build(m, shadow);
    if (mesh) {
      statics.push(mesh);
      root.add(mesh);
    }
    b.dispose();
  }
  // glass sorts after everything opaque
  statics.forEach((m) => {
    if (m.material === mats.glass) m.renderOrder = 3;
  });

  const hitTargets = [...rigs.values()].flatMap((r) => r.hit);

  // ---- atmosphere: light shafts and dust --------------------------------------------------------------------
  const shaftTex = track(shaftTexture());
  const shaftGeo = track(new THREE.PlaneGeometry(1, 1));
  const shafts: { mat: THREE.MeshBasicMaterial; id: PlaceId | null; base: number }[] = [];
  const addShaft = (x: number, z: number, y0: number, w: number, h: number, id: PlaceId | null, base: number, color: number) => {
    const mat = track(new THREE.MeshBasicMaterial({ map: shaftTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    for (const ry of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(shaftGeo, mat);
      m.position.set(x, y0 - h / 2, z);
      m.scale.set(w, h, 1);
      m.rotation.y = ry;
      m.renderOrder = 4;
      root.add(m);
    }
    shafts.push({ mat, id, base });
  };
  addShaft(0, 0, 11.5, 11, 11.5, "core", 0.11, 0xf2d9a8);
  addShaft(-3, 2, 11.5, 5, 11, "core", 0.06, 0xf2d9a8);
  // (light shafts are big additive layers, the most expensive thing in the room: only the core has them)

  const dustN = 200;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 100;
    dustPos[i * 3 + 1] = 0.5 + Math.random() * 13;
    dustPos[i * 3 + 2] = -40 + Math.random() * 90;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = track(new THREE.PointsMaterial({ map: glow, size: 0.32, color: 0xe8e4d8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  root.add(dust);

  // ---- conduits: the LangGraph edges, as overhead cable runs with packets travelling them ---------------------
  const conduitGroup = new THREE.Group();
  root.add(conduitGroup);
  let conduits: Conduit[] = [];
  const clearConduits = () => {
    for (const child of [...conduitGroup.children]) {
      conduitGroup.remove(child);
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    conduits = [];
  };
  const curveBetween = (a: string, b: string): THREE.QuadraticBezierCurve3 | null => {
    const za = (ZONES as Record<string, (typeof ZONES)[KnownAgentId]>)[a];
    const zb = (ZONES as Record<string, (typeof ZONES)[KnownAgentId]>)[b];
    if (!za || !zb) return null;
    const pa = new THREE.Vector3(...port(za));
    const pb = new THREE.Vector3(...port(zb));
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y = Math.max(pa.y, pb.y) + 2.4 + pa.distanceTo(pb) * 0.08;
    return new THREE.QuadraticBezierCurve3(pa, mid, pb);
  };

  const packets: Packet[] = [];
  const packetGeo = track(new THREE.BufferGeometry());
  packetGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_PACKETS * 3), 3));
  const packetMat = track(new THREE.PointsMaterial({ map: glow, size: 1.3, color: 0xd9e6d0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, toneMapped: false }));
  const packetPts = new THREE.Points(packetGeo, packetMat);
  packetPts.frustumCulled = false;
  packetPts.renderOrder = 5;
  root.add(packetPts);

  // ---- animation state ----------------------------------------------------------------------------------------
  const anim = new Map<PlaceId, Anim>();
  for (const id of rigs.keys()) anim.set(id, { color: new THREE.Color(TONE_LOOK.dormant.hex), power: 0.26, flash: 0, hover: 0 });
  let power = 1;
  let wake = 0;
  let mood = 0; // 0 neutral .. 1 replanning (amber)
  let failedMood = 0;
  const keyBase = new THREE.Color(0xffe6c0);
  const keyAmber = new THREE.Color(0xffc97a);
  const keyCopper = new THREE.Color(0xf0b294);
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();

  return {
    root,
    rigs,
    core,
    hitTargets,
    setEdges(edges) {
      clearConduits();
      for (const e of edges) {
        const curve = curveBetween(e.source, e.target);
        if (!curve) continue; // __start__ / __end__
        const mat = new THREE.MeshBasicMaterial({ color: 0x55564d, transparent: true, opacity: e.conditional ? 0.55 : 0.85, toneMapped: false });
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, e.conditional ? 0.045 : 0.075, 6, false), mat);
        tube.renderOrder = 2;
        conduitGroup.add(tube);
        conduits.push({ a: e.source, b: e.target, curve, mat, conditional: e.conditional, level: e.conditional ? 0.5 : 0.75, pts: curve.getPoints(14) });
      }
    },
    setPower(p) {
      power = p;
      mats.emit.color.setScalar(0.25 + 0.75 * p);
    },
    flash(id) {
      const a = anim.get(id);
      if (a) a.flash = 1;
    },
    packet(from, to) {
      const known = conduits.find((c) => c.a === from && c.b === to);
      const curve = known?.curve ?? curveBetween(from, to);
      if (!curve) return;
      packets.push({ curve, t0: performance.now() / 1000, dur: 2.2 });
      if (packets.length > MAX_PACKETS) packets.shift();
      this.flash(to as PlaceId);
    },

    update(s, ui, t, dt) {
      const k3 = damp(3, dt);
      wake += ((s.awake ? 1 : 0) - wake) * damp(1.2, dt);
      mood += ((s.replan.active ? 1 : 0) - mood) * damp(1.4, dt);
      failedMood += ((s.phase === "failed" ? 1 : 0) - failedMood) * damp(1.2, dt);

      for (const [id, rig] of rigs) {
        const a = anim.get(id) as Anim;
        const tone: Tone = id === "core" ? coreTone(s) : s.zones[id as KnownAgentId].tone;
        const look = TONE_LOOK[tone];
        a.color.lerp(tmpC.set(look.hex), damp(4, dt));
        a.power += (look.power - a.power) * k3;
        a.flash = Math.max(0, a.flash - dt * 1.4);
        a.hover += ((ui.hover === id ? 1 : 0) - a.hover) * damp(8, dt);
        const pulse = look.pulse ? 0.8 + 0.2 * Math.sin(t * Math.PI * 2 * look.pulse) : 1;
        rig.update({
          s,
          z: id === "core" ? null : s.zones[id as KnownAgentId],
          color: a.color,
          glow: a.power * pulse * (0.35 + 0.65 * power),
          flash: a.flash,
          hover: a.hover,
          selected: ui.selected === id,
          t,
          dt,
        });
      }

      // mood: a replan turns the room's key light amber; a failed run cools and desaturates it a little
      key.color.copy(keyBase).lerp(keyAmber, mood * 0.8).lerp(keyCopper, failedMood * 0.5);
      key.intensity = (3.1 * (0.3 + 0.7 * power)) * (1 - 0.12 * failedMood);
      hemi.intensity = (0.85 * (0.35 + 0.65 * power)) * (1 - 0.18 * mood);
      coreLamp.intensity = 80 * (0.2 + 0.8 * power);
      coreLamp.color.copy(a2(anim, "core")).lerp(keyBase, 0.6);

      for (const sh of shafts) {
        const a = sh.id ? (anim.get(sh.id) as Anim) : null;
        sh.mat.opacity = sh.base * (0.35 + 0.65 * (a ? a.power * 1.1 : 0.7)) * (0.25 + 0.75 * power) * (0.9 + 0.1 * Math.sin(t * 0.5 + sh.base * 40));
      }
      precinct.update(t, dt, power);
      dust.rotation.y = t * 0.004;
      dustMat.opacity = 0.35 * (0.3 + 0.7 * power);

      // conduits: lit when their source works; packets travel them
      for (const c of conduits) {
        const src = c.a in s.zones ? s.zones[c.a as KnownAgentId] : null;
        const busy = !!src?.busy;
        const a = anim.get(c.a as PlaceId);
        const tgt = c.mat.color;
        if (busy && a) tgt.lerp(a.color, damp(5, dt));
        else tgt.lerp(tmpC.set(0x4a4a42), damp(3, dt));
        c.level += ((busy ? 1 : c.conditional ? 0.5 : 0.75) - c.level) * damp(4, dt);
        // a cable never hangs in front of the lens: it fades as the camera comes close
        let near = Infinity;
        if (ui.cam) for (const p of c.pts) near = Math.min(near, p.distanceTo(ui.cam));
        c.mat.opacity = c.level * smoothstep((near - 5) / 10);
      }
      const now = performance.now() / 1000;
      const pos = packetGeo.getAttribute("position") as THREE.BufferAttribute;
      let n = 0;
      // continuous flow from working sources along their outgoing edges
      for (const c of conduits) {
        const src = c.a in s.zones ? s.zones[c.a as KnownAgentId] : null;
        if (src?.busy) {
          for (let j = 0; j < 2 && n < MAX_PACKETS; j++) {
            c.curve.getPoint((t * 0.22 + j / 2) % 1, tmpV);
            pos.setXYZ(n++, tmpV.x, tmpV.y, tmpV.z);
          }
        }
      }
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        const u = (now - p.t0) / p.dur;
        if (u >= 1) {
          packets.splice(i, 1);
          continue;
        }
        if (n < MAX_PACKETS) {
          p.curve.getPoint(u, tmpV);
          pos.setXYZ(n++, tmpV.x, tmpV.y, tmpV.z);
        }
      }
      for (; n < MAX_PACKETS; n++) pos.setXYZ(n, 0, -60, 0);
      pos.needsUpdate = true;
    },

    dispose() {
      clearConduits();
      for (const r of rigs.values()) r.dispose();
      statics.forEach((m) => m.geometry.dispose());
      arch.dispose();
      precinct.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function a2(anim: Map<PlaceId, Anim>, id: PlaceId): THREE.Color {
  return (anim.get(id) as Anim).color;
}

export type { Molecule };
