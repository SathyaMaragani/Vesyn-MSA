// The NeoChems laboratory as a three.js scene graph. ONE world, two drivers:
//   - /lab       feeds it real state derived from backend events;
//   - the airlock feeds it a scripted "power-up" (a cinematic, not backend state).
// The world itself owns no data: everything it draws is a function of the
// WorldState it is handed each frame.
//
// Performance notes: geometries are shared across workstations, ribbons of
// route bars are one InstancedMesh, data pulses are one Points object, there are
// no shadow maps, and a workstation costs ~14 meshes and 1 point light.
import * as THREE from "three";
import { ACTIVITY_META } from "@/lib/events/activity";
import { AGENT_PRESENTATION, type Equipment } from "@/lib/events/presentation";
import type { Activity } from "@/types/agents";
import type { AssessmentSummary } from "@/types/events";
import type { Molecule } from "@/lib/chem/molecule";
import { createMoleculeMesh, type MoleculeMesh } from "./moleculeMesh";
import { KNOWN_AGENT_IDS } from "@/types/agents";

export interface RigState {
  activity: Activity;
  /** A tool call is in flight for this agent. */
  busy: boolean;
  /** 0 = unpowered, 1 = fully lit. The real lab always passes 1. */
  power: number;
}

export interface RouteBar {
  assessment: AssessmentSummary | null;
  steps: number;
}

export interface WorldState {
  rig: (agentId: string) => RigState;
  selectedId: string | null;
  /** A target molecule has been received (MOLECULE_RECEIVED). */
  targetActive: boolean;
  /** Routes of the latest attempt, coloured by the validator's verdict. */
  routes: readonly RouteBar[];
  /** Overall power of the core and floor lines (cinematic ramp; 1 in the lab). */
  corePower: number;
}

interface Spinner {
  obj: THREE.Object3D;
  speed: number;
  axis: "x" | "y" | "z";
}

export interface AgentRig {
  id: string;
  group: THREE.Group;
  avatar: THREE.Mesh;
  halo: THREE.Mesh;
  rim: THREE.Mesh;
  monitor: THREE.Mesh;
  light: THREE.PointLight;
  tint: THREE.MeshBasicMaterial[];
  spinners: Spinner[];
  color: THREE.Color;
  position: THREE.Vector3;
}

export interface LabWorld {
  root: THREE.Group;
  rigs: Map<string, AgentRig>;
  hitTargets: THREE.Object3D[];
  /** World-space point above a workstation, for HTML labels. */
  anchor: (id: string) => THREE.Vector3;
  coreAnchor: THREE.Vector3;
  setEdges: (edges: readonly { source: string; target: string; conditional: boolean }[]) => void;
  /** Put the real target molecule at the core (null restores the abstract marker). */
  setMolecule: (mol: Molecule | null) => void;
  /** Atom index under the ray, or null. Only meaningful while a molecule is set. */
  pickAtom: (raycaster: THREE.Raycaster) => number | null;
  setAtomHighlight: (atom: number | null) => void;
  update: (state: WorldState, t: number) => void;
  dispose: () => void;
}

const OFF = 0x1b1d19;
const SLATE = 0x5a5647;
const ASSESSMENT_HEX: Record<AssessmentSummary | "pending", number> = {
  pending: 0x8faf9a,
  STRONGLY_SUPPORTED: 0xb9c98a,
  SUPPORTED: 0xb9c98a,
  INSUFFICIENT_EVIDENCE: 0xd6a45b,
  REVIEW_REQUIRED: 0xcd644e,
};
const MAX_ROUTE_BARS = 16;
const PULSES_PER_EDGE = 3;
const MAX_PULSES = 48;

function tinted(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

export function createLabWorld(): LabWorld {
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  // --- lights -------------------------------------------------------------
  root.add(new THREE.AmbientLight(0xb8b2a0, 0.55));
  const key = new THREE.DirectionalLight(0xf2ead8, 0.9);
  key.position.set(12, 22, 14);
  root.add(key);

  // --- floor ----------------------------------------------------------------
  const floorGeo = track(new THREE.CircleGeometry(18, 96));
  const floorMat = track(new THREE.MeshStandardMaterial({ color: 0x141512, roughness: 0.95, metalness: 0.1 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);

  const grid = new THREE.GridHelper(36, 36, 0x34382e, 0x1f2119);
  grid.position.y = 0.01;
  const gridMat = grid.material as THREE.LineBasicMaterial;
  gridMat.transparent = true;
  gridMat.opacity = 0.5;
  track(grid.geometry);
  track(gridMat);
  root.add(grid);

  const rangeRing = new THREE.Mesh(
    track(new THREE.RingGeometry(17.7, 17.82, 128)),
    track(new THREE.MeshBasicMaterial({ color: 0x8faf9a, transparent: true, opacity: 0.25, side: THREE.DoubleSide })),
  );
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.position.y = 0.02;
  root.add(rangeRing);

  // --- shared geometry ---------------------------------------------------------
  const G = {
    base: track(new THREE.CylinderGeometry(1.3, 1.45, 0.4, 40)),
    rim: track(new THREE.TorusGeometry(1.32, 0.035, 12, 64)),
    desk: track(new THREE.BoxGeometry(1.7, 0.7, 0.8)),
    monitor: track(new THREE.BoxGeometry(1.2, 0.62, 0.05)),
    halo: track(new THREE.TorusGeometry(0.9, 0.02, 12, 64)),
    hit: track(new THREE.CylinderGeometry(1.8, 1.8, 3.8, 16)),
    avatar: track(new THREE.IcosahedronGeometry(0.5, 0)),
    cube: track(new THREE.BoxGeometry(0.22, 0.22, 0.22)),
    slab: track(new THREE.BoxGeometry(0.9, 0.08, 0.5)),
    tube: track(new THREE.CylinderGeometry(0.34, 0.34, 1.9, 24, 1, true)),
    gate: track(new THREE.TorusGeometry(1.05, 0.03, 10, 64)),
    panel: track(new THREE.PlaneGeometry(0.9, 1.15)),
    step: track(new THREE.BoxGeometry(0.42, 0.5, 0.42)),
    knot: track(new THREE.TorusKnotGeometry(0.28, 0.07, 64, 10)),
  };
  const baseMat = track(new THREE.MeshStandardMaterial({ color: 0x3a382f, roughness: 0.38, metalness: 0.85 }));
  const deskMat = track(new THREE.MeshStandardMaterial({ color: 0x48453a, roughness: 0.42, metalness: 0.8 }));

  const rigs = new Map<string, AgentRig>();
  const hitTargets: THREE.Object3D[] = [];

  // Workstation-specific equipment. Purely identity: what each agent's bench looks like.
  function equipment(kind: Equipment, rig: { tint: THREE.MeshBasicMaterial[]; spinners: Spinner[] }, g: THREE.Group) {
    const t = (o: number) => {
      const m = track(tinted(SLATE, o));
      rig.tint.push(m);
      return m;
    };
    switch (kind) {
      case "holotable": {
        // planner: task cubes orbiting a command table
        const orbit = new THREE.Group();
        orbit.position.y = 1.5;
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(G.cube, t(0.9));
          c.position.set(Math.cos((i * Math.PI * 2) / 3) * 1.05, 0, Math.sin((i * Math.PI * 2) / 3) * 1.05);
          orbit.add(c);
        }
        g.add(orbit);
        rig.spinners.push({ obj: orbit, speed: 0.9, axis: "y" });
        break;
      }
      case "library": {
        // research: stacked data slabs
        for (let i = 0; i < 4; i++) {
          const s = new THREE.Mesh(G.slab, t(0.55));
          s.position.set(-1.35, 0.55 + i * 0.16, -0.2);
          s.rotation.y = 0.2 * (i % 2 ? 1 : -1);
          g.add(s);
        }
        break;
      }
      case "reactor": {
        // retrosynthesis: a reaction vessel
        const tube = new THREE.Mesh(G.tube, t(0.28));
        tube.position.set(-1.45, 1.35, -0.1);
        tube.material.side = THREE.DoubleSide;
        g.add(tube);
        break;
      }
      case "scanner": {
        // validator: a scanning gate around the avatar
        const gate = new THREE.Mesh(G.gate, t(0.7));
        gate.position.set(0, 2.15, 0);
        gate.rotation.y = Math.PI / 2;
        g.add(gate);
        rig.spinners.push({ obj: gate, speed: 0.6, axis: "x" });
        break;
      }
      case "review": {
        // critic: angled review panels
        for (const side of [-1, 1]) {
          const p = new THREE.Mesh(G.panel, t(0.22));
          p.material.side = THREE.DoubleSide;
          p.position.set(side * 1.5, 1.4, 0.1);
          p.rotation.y = side * 0.6;
          g.add(p);
        }
        break;
      }
      case "loop": {
        // replanner: a knot that turns back on itself
        const k = new THREE.Mesh(G.knot, t(0.85));
        k.position.set(0, 3.15, 0);
        g.add(k);
        rig.spinners.push({ obj: k, speed: 1.1, axis: "y" });
        break;
      }
      case "podium": {
        // evaluator: a ranking podium
        [0.5, 0.75, 0.32].forEach((h, i) => {
          const s = new THREE.Mesh(G.step, t(0.5));
          s.scale.y = h / 0.5;
          s.position.set(-1.05 + i * 0.5, 0.42 + h / 2, -0.35);
          g.add(s);
        });
        break;
      }
    }
  }

  for (const id of KNOWN_AGENT_IDS) {
    const pres = AGENT_PRESENTATION[id];
    const group = new THREE.Group();
    const position = new THREE.Vector3(...pres.position);
    group.position.copy(position);
    group.rotation.y = Math.atan2(position.x, position.z); // local +z faces away from the core

    const tint: THREE.MeshBasicMaterial[] = [];
    const spinners: Spinner[] = [];

    const base = new THREE.Mesh(G.base, baseMat);
    base.position.y = 0.2;
    group.add(base);

    const rim = new THREE.Mesh(G.rim, track(new THREE.MeshBasicMaterial({ color: SLATE })));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.41;
    group.add(rim);

    const desk = new THREE.Mesh(G.desk, deskMat);
    desk.position.set(0, 0.75, 0.85);
    group.add(desk);

    const monitor = new THREE.Mesh(
      G.monitor,
      track(new THREE.MeshStandardMaterial({ color: 0x1b1d19, emissive: new THREE.Color(SLATE), emissiveIntensity: 0.2, roughness: 0.3 })),
    );
    monitor.position.set(0, 1.35, 0.8);
    monitor.rotation.x = -0.18;
    group.add(monitor);

    const avatar = new THREE.Mesh(
      G.avatar,
      track(new THREE.MeshStandardMaterial({ color: 0x23241f, emissive: new THREE.Color(SLATE), emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.7 })),
    );
    avatar.position.set(0, 2.15, 0);
    group.add(avatar);

    const halo = new THREE.Mesh(G.halo, track(new THREE.MeshBasicMaterial({ color: SLATE, transparent: true, opacity: 0.8 })));
    halo.position.set(0, 2.15, 0);
    halo.rotation.x = Math.PI / 3;
    group.add(halo);

    const light = new THREE.PointLight(SLATE, 0.3, 6);
    light.position.set(0, 2.6, 0);
    group.add(light);

    const hit = new THREE.Mesh(G.hit, track(new THREE.MeshBasicMaterial({ visible: false })));
    hit.position.y = 1.9;
    hit.userData = { agentId: id };
    group.add(hit);
    hitTargets.push(hit);

    equipment(pres.equipment, { tint, spinners }, group);
    root.add(group);
    rigs.set(id, { id, group, avatar, halo, rim, monitor, light, tint, spinners, color: new THREE.Color(OFF), position });
  }

  // --- route rack beside the retrosynthesis bench (one InstancedMesh) --------------
  const barGeo = track(new THREE.BoxGeometry(0.26, 1, 0.26));
  const barMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const bars = new THREE.InstancedMesh(barGeo, barMat, MAX_ROUTE_BARS);
  bars.count = 0;
  bars.frustumCulled = false;
  bars.position.set(1.9, 0, -0.9);
  rigs.get("retro")?.group.add(bars);
  const barDummy = new THREE.Object3D();
  const barColor = new THREE.Color();
  let barsKey = "";

  // --- molecule core -----------------------------------------------------------------
  const core = new THREE.Group();
  const coreDisc = new THREE.Mesh(track(new THREE.CylinderGeometry(1.9, 2.05, 0.22, 48)), baseMat);
  coreDisc.position.y = 0.11;
  core.add(coreDisc);
  const coreRingMat = track(new THREE.MeshBasicMaterial({ color: SLATE }));
  const coreRing = new THREE.Mesh(track(new THREE.TorusGeometry(2.0, 0.03, 12, 96)), coreRingMat);
  coreRing.rotation.x = Math.PI / 2;
  coreRing.position.y = 0.24;
  core.add(coreRing);
  const coreLineMat = track(new THREE.LineBasicMaterial({ color: SLATE, transparent: true, opacity: 0.9 }));
  const outer = new THREE.LineSegments(track(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.15, 1))), coreLineMat);
  outer.position.y = 2.1;
  const inner = new THREE.LineSegments(track(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.55))), coreLineMat);
  inner.position.y = 2.1;
  const orbit = new THREE.Mesh(track(new THREE.TorusGeometry(1.65, 0.014, 8, 96)), coreRingMat);
  orbit.position.y = 2.1;
  core.add(outer, inner, orbit);
  const lattice = [outer, inner, orbit];
  let molMesh: MoleculeMesh | null = null;
  const molGroup = new THREE.Group();
  molGroup.position.y = 2.1;
  core.add(molGroup);
  const coreLight = new THREE.PointLight(SLATE, 0.2, 9);
  coreLight.position.set(0, 2.4, 0);
  core.add(coreLight);
  root.add(core);

  // --- graph edges and data pulses --------------------------------------------------------
  const edgeGroup = new THREE.Group();
  root.add(edgeGroup);
  let edgeList: { a: AgentRig; b: AgentRig }[] = [];
  const pulseGeo = track(new THREE.BufferGeometry());
  pulseGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_PULSES * 3), 3));
  const pulseMat = track(new THREE.PointsMaterial({ color: 0xb9cdb4, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }));
  const pulses = new THREE.Points(pulseGeo, pulseMat);
  pulses.frustumCulled = false;
  root.add(pulses);

  function clearEdges() {
    for (const child of [...edgeGroup.children]) {
      edgeGroup.remove(child);
      (child as THREE.Line).geometry.dispose();
      ((child as THREE.Line).material as THREE.Material).dispose();
    }
  }

  const tmp = new THREE.Color();
  const target = new THREE.Color();

  return {
    root,
    rigs,
    hitTargets,
    anchor: (id) => (rigs.get(id)?.position ?? new THREE.Vector3()).clone().setY(3.9),
    coreAnchor: new THREE.Vector3(0, 3.9, 0),

    setMolecule(mol) {
      if (molMesh) {
        molGroup.remove(molMesh.group);
        molMesh.dispose();
        molMesh = null;
      }
      for (const l of lattice) l.visible = mol === null;
      if (mol) {
        molMesh = createMoleculeMesh(mol);
        molGroup.add(molMesh.group);
      }
    },
    pickAtom(raycaster) {
      return molMesh ? molMesh.pick(raycaster) : null;
    },
    setAtomHighlight(atom) {
      molMesh?.setHighlight(atom);
    },

    setEdges(edges) {
      clearEdges();
      edgeList = [];
      for (const e of edges) {
        const a = rigs.get(e.source);
        const b = rigs.get(e.target);
        if (!a || !b) continue; // __start__ / __end__
        const geo = new THREE.BufferGeometry().setFromPoints([a.position.clone().setY(0.06), b.position.clone().setY(0.06)]);
        const mat = e.conditional
          ? new THREE.LineDashedMaterial({ color: 0x66765f, dashSize: 0.35, gapSize: 0.25 })
          : new THREE.LineBasicMaterial({ color: 0x4d5a48 });
        const line = new THREE.Line(geo, mat);
        if (e.conditional) line.computeLineDistances();
        edgeGroup.add(line);
        edgeList.push({ a, b });
      }
    },

    update(state, t) {
      // workstations
      for (const rig of rigs.values()) {
        const rs = state.rig(rig.id);
        const meta = ACTIVITY_META[rs.activity];
        const p = THREE.MathUtils.clamp(rs.power, 0, 1);
        const k = meta.intensity * p;

        target.setHex(OFF).lerp(tmp.setHex(meta.hex), p);
        rig.color.lerp(target, 0.14);

        const am = rig.avatar.material as THREE.MeshStandardMaterial;
        am.emissive.copy(rig.color);
        am.emissiveIntensity = (0.2 + k * 0.6 + (k > 0.5 ? Math.sin(t * 6) * 0.15 : 0)) * (0.3 + 0.7 * p);
        am.color.copy(rig.color).multiplyScalar(0.35);
        (rig.halo.material as THREE.MeshBasicMaterial).color.copy(rig.color);
        (rig.rim.material as THREE.MeshBasicMaterial).color.copy(rig.color);
        for (const m of rig.tint) m.color.copy(rig.color);
        const mm = rig.monitor.material as THREE.MeshStandardMaterial;
        mm.emissive.copy(rig.color);
        mm.emissiveIntensity = rs.busy ? 0.9 + Math.sin(t * 8) * 0.15 : (0.1 + k * 0.3) * p;
        rig.light.color.copy(rig.color);
        rig.light.intensity = (0.15 + k * 1.4 + (state.selectedId === rig.id ? 0.6 : 0)) * p;

        rig.avatar.rotation.y = t * (0.3 + k * 2.4);
        rig.avatar.rotation.x = Math.sin(t * 1.3) * 0.12;
        rig.avatar.position.y = 2.15 + Math.sin(t * (1.2 + k * 3)) * (0.04 + k * 0.08);
        rig.halo.rotation.z = t * (0.4 + k * 2.2);
        for (const s of rig.spinners) s.obj.rotation[s.axis] = t * s.speed * (0.4 + k * 2);
      }

      // route rack: real routes, coloured by the validator's verdict
      const n = Math.min(state.routes.length, MAX_ROUTE_BARS);
      const key = state.routes.slice(0, n).map((r) => `${r.assessment ?? "p"}${r.steps}`).join(",");
      if (key !== barsKey) {
        barsKey = key;
        bars.count = n;
        for (let i = 0; i < n; i++) {
          const r = state.routes[i];
          const h = 0.25 + Math.max(1, r.steps) * 0.32;
          barDummy.position.set(i * 0.4, 0.42 + h / 2, 0);
          barDummy.scale.set(1, h, 1);
          barDummy.updateMatrix();
          bars.setMatrixAt(i, barDummy.matrix);
          bars.setColorAt(i, barColor.setHex(ASSESSMENT_HEX[r.assessment ?? "pending"]));
        }
        bars.instanceMatrix.needsUpdate = true;
        if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
      }

      // molecule core: dim until a target exists
      const cp = THREE.MathUtils.clamp(state.corePower, 0, 1);
      target.setHex(state.targetActive ? 0x8faf9a : SLATE).lerp(tmp.setHex(OFF), 1 - cp);
      coreLineMat.color.lerp(target, 0.12);
      coreRingMat.color.copy(coreLineMat.color);
      coreLight.color.copy(coreLineMat.color);
      coreLight.intensity = (state.targetActive ? 1.2 : 0.2) * cp;
      const spin = state.targetActive ? 0.5 : 0.12;
      if (molMesh) molGroup.rotation.y = t * 0.18;
      outer.rotation.y = t * spin;
      outer.rotation.x = t * spin * 0.6;
      inner.rotation.y = -t * spin * 1.6;
      orbit.rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.3;
      orbit.rotation.z = t * spin;

      // data pulses travel from a busy agent along its outgoing graph edges
      const pos = pulseGeo.getAttribute("position") as THREE.BufferAttribute;
      let i = 0;
      for (const e of edgeList) {
        const active = state.rig(e.a.id).busy;
        for (let j = 0; j < PULSES_PER_EDGE && i < MAX_PULSES; j++, i++) {
          if (active) {
            const f = (t * 0.45 + j / PULSES_PER_EDGE) % 1;
            pos.setXYZ(i, e.a.position.x + (e.b.position.x - e.a.position.x) * f, 0.5, e.a.position.z + (e.b.position.z - e.a.position.z) * f);
          } else pos.setXYZ(i, 0, -50, 0);
        }
      }
      for (; i < MAX_PULSES; i++) pos.setXYZ(i, 0, -50, 0);
      pos.needsUpdate = true;
    },

    dispose() {
      clearEdges();
      molMesh?.dispose();
      bars.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
