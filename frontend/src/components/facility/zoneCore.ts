// THE MOLECULAR CORE and the PLANNER'S GALLERY.
//
// The core is the heart of the facility and its largest single structure: a glass analysis chamber, ten
// metres tall, on a dialled platform, the target molecule held on its stage in a scanning field, ringed by
// instrument consoles, a rotating gantry and four projection stations. The molecule is the REAL target (the
// graph of the SMILES the backend resolved). With no run the chamber is empty and its screens say
// "no target"; nothing stands in for a molecule that does not exist.
//
// The projection stations show real molecules at a smaller scale: the displayed route's starting materials
// (with the validator's stock check), or, before a route exists, the research agent's analogues. Once a route
// exists an arc runs from each starting material to the target: the route, as the backend reports it.
//
// The gallery is the orchestration layer: an annular deck one level up that looks down into the chamber.
// The planner's console stands on it; its task tokens are the run's real tasks.
import * as THREE from "three";
import { molecularWeight, ringCount } from "@/lib/chem/analysis";
import { getMolecule, type Molecule } from "@/lib/chem/molecule";
import { createMoleculeMesh, type MoleculeMesh } from "@/components/world/moleculeMesh";
import type { MolecularProperties } from "../../types/chemistry.ts";
import { TONE_LOOK, projectionsOf, type Projection } from "./facilityState";
import { ZONES } from "./layout";
import { Batch, C } from "./kit";
import { INK, Screen, frame, paragraph, text } from "./screen";
import { makeFrame, railing, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

export interface CoreRig extends ZoneRig {
  setMolecule: (mol: Molecule | null) => void;
  pickAtom: (ray: THREE.Raycaster) => number | null;
  pickBond: (ray: THREE.Raycaster) => number | null;
  setAtomHighlight: (atom: number | null) => void;
  setBondHighlight: (bond: number | null) => void;
  /** world position of the molecule (for camera framing and labels) */
  moleculeAnchor: THREE.Vector3;
}

/** Chamber geometry, in metres (the camera poses in layout.ts are framed against these). */
export const CORE = { chamberR: 5.6, glassH: 10.2, stageTop: 2.6, molY: 5.3, consoleR: 7.35, stationR: 6.9 };
const STATIONS = 4;

interface Station {
  group: THREE.Group;
  molHolder: THREE.Group;
  mol: MoleculeMesh | null;
  plaque: Screen;
  beamMat: THREE.MeshBasicMaterial;
  key: string;
}

export function buildCore(env: BuildEnv): CoreRig {
  const group = new THREE.Group();
  const acc = new Batch();
  const { chamberR, glassH, stageTop, molY, consoleR, stationR } = CORE;

  // platform, dial, glass chamber, stage
  env.metal.cyl(8.5, 8.7, 0.22, 0, 0.11, 0, C.metal, 72);
  env.metal.cyl(7.9, 8.0, 0.32, 0, 0.38, 0, C.brushed, 72);
  env.matte.cyl(7.5, 7.5, 0.03, 0, 0.55, 0, 0x14150f, 72);
  env.glass.cyl(chamberR, chamberR, glassH, 0, 0.6 + glassH / 2, 0, C.glass, 64);
  const ringGeo = new THREE.TorusGeometry(chamberR, 0.1, 8, 80);
  env.metal.geo(ringGeo, 0, 0.62, 0, C.brushed, 1, 0, Math.PI / 2);
  env.metal.geo(ringGeo, 0, 0.6 + glassH, 0, C.brushed, 1, 0, Math.PI / 2);
  env.metal.geo(new THREE.TorusGeometry(chamberR, 0.05, 6, 80), 0, 0.6 + glassH * 0.5, 0, C.metal, 1, 0, Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    env.metal.box(0.13, glassH, 0.13, Math.cos(a) * chamberR, 0.6 + glassH / 2, Math.sin(a) * chamberR, C.metal);
  }
  // the stage the molecule is held over: a stepped drum with a lit collar
  env.metal.cyl(1.5, 2.2, 1.9, 0, 1.55, 0, C.metal, 40);
  env.metal.cyl(1.9, 1.9, 0.1, 0, stageTop - 0.05, 0, C.steel, 40);
  env.metal.cyl(0.14, 0.14, 1.4, 0, stageTop + 0.7, 0, C.brushed, 10);
  acc.geo(new THREE.TorusGeometry(1.92, 0.035, 6, 56), 0, stageTop + 0.01, 0, 0xffffff, 1, 0, Math.PI / 2);
  acc.geo(new THREE.TorusGeometry(2.25, 0.03, 6, 56), 0, 0.72, 0, 0xffffff, 1, 0, Math.PI / 2);
  acc.geo(new THREE.TorusGeometry(6.2, 0.05, 6, 120), 0, 0.575, 0, 0xffffff, 1, 0, Math.PI / 2);
  acc.geo(new THREE.TorusGeometry(7.75, 0.04, 6, 120), 0, 0.575, 0, 0xffffff, 1, 0, Math.PI / 2);
  // the platform's dial: fine tick marks, long every fifth
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const long = i % 5 === 0;
    acc.box(long ? 0.5 : 0.24, 0.02, 0.04, Math.cos(a) * 6.75, 0.575, Math.sin(a) * 6.75, 0xffffff, -a);
  }
  // the consoles ring the chamber, each with a screen turned toward the molecule
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.sin(a) * consoleR;
    const z = Math.cos(a) * consoleR;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.55, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI), new THREE.Vector3(1, 1, 1));
    env.metal.push(m);
    env.matte.push(m);
    env.metal.box(2.4, 0.9, 0.95, 0, 0.45, 0, C.metal);
    env.matte.box(2.2, 0.06, 0.75, 0, 0.93, 0, 0x22231f);
    env.metal.box(0.12, 0.8, 0.12, -1.0, 1.35, -0.3, C.brushed);
    env.metal.box(0.12, 0.8, 0.12, 1.0, 1.35, -0.3, C.brushed);
    env.metal.box(2.4, 0.06, 0.18, 0, 1.78, -0.3, C.brushed);
    env.matte.pop();
    env.metal.pop();
  }
  // the four projection stations: plinth, lit collar
  for (let i = 0; i < STATIONS; i++) {
    const a = (i * Math.PI) / 2;
    const x = Math.sin(a) * stationR;
    const z = Math.cos(a) * stationR;
    env.metal.cyl(0.62, 0.78, 0.85, x, 0.97, z, C.metal, 24);
    env.metal.cyl(0.66, 0.66, 0.06, x, 1.42, z, C.steel, 24);
    acc.geo(new THREE.TorusGeometry(0.64, 0.025, 6, 32), x, 1.46, z, 0xffffff, 1, 0, Math.PI / 2);
  }
  // overhead: a cross of beams with light panels, and a crown ring hung on wires
  env.metal.box(15, 0.18, 0.24, 0, 12.2, 0, C.brushed);
  env.metal.box(0.24, 0.18, 15, 0, 12.2, 0, C.brushed);
  for (const [x, z] of [[4.2, 0], [-4.2, 0], [0, 4.2], [0, -4.2]]) {
    env.emit.box(3.0, 0.06, 0.55, x, 12.0, z, 0x9d9480, z === 0 ? 0 : Math.PI / 2);
    env.metal.box(0.05, 1.6, 0.05, x, 13.0, z, C.metal);
  }
  env.metal.geo(new THREE.TorusGeometry(6.4, 0.12, 8, 96), 0, 11.0, 0, C.brushed, 1, 0, Math.PI / 2);
  acc.geo(new THREE.TorusGeometry(6.4, 0.04, 6, 120), 0, 10.9, 0, 0xffffff, 1, 0, Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    env.metal.box(0.03, 1.6, 0.03, Math.cos(a) * 6.4, 11.8, Math.sin(a) * 6.4, C.steel);
  }
  env.metal.cyl(0.5, 0.9, 0.7, 0, 11.3, 0, C.metal, 20);
  env.emit.cyl(0.42, 0.42, 0.05, 0, 10.93, 0, 0xd9cdb0, 20);
  const accMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const accMesh = acc.build(accMat, false);
  if (accMesh) group.add(accMesh);

  // the gantry: a ring that turns above the chamber, with two arms reaching down
  const gantry = new THREE.Group();
  gantry.position.y = 9.5;
  const gMat = env.track(new THREE.MeshStandardMaterial({ color: C.brushed, roughness: 0.4, metalness: 0.85 }));
  gantry.add(new THREE.Mesh(env.track(new THREE.TorusGeometry(chamberR + 0.55, 0.15, 10, 96)), gMat));
  gantry.children[0].rotation.x = Math.PI / 2;
  const armGeo = env.track(new THREE.BoxGeometry(0.18, 1, 0.18));
  const tipMat = env.track(new THREE.MeshBasicMaterial({ color: C.amber, toneMapped: false }));
  const arms = [0, Math.PI].map((a) => {
    const arm = new THREE.Group();
    arm.position.set(Math.cos(a) * (chamberR + 0.55), 0, Math.sin(a) * (chamberR + 0.55));
    arm.rotation.y = -a;
    const upper = new THREE.Mesh(armGeo, gMat);
    upper.scale.y = 2.2;
    upper.position.set(-0.7, -0.85, 0);
    upper.rotation.z = 0.55;
    const lower = new THREE.Mesh(armGeo, gMat);
    lower.scale.y = 1.9;
    lower.position.set(-1.45, -2.25, 0);
    lower.rotation.z = -0.45;
    const tip = new THREE.Mesh(env.track(new THREE.SphereGeometry(0.13, 10, 8)), tipMat);
    tip.position.set(-1.05, -3.05, 0);
    arm.add(upper, lower, tip);
    gantry.add(arm);
    return arm;
  });
  group.add(gantry);

  // the molecule: held above the stage in a scanning field
  const molGroup = new THREE.Group();
  molGroup.position.set(0, molY, 0);
  group.add(molGroup);
  let molMesh: MoleculeMesh | null = null;
  const fieldMat = env.track(new THREE.MeshBasicMaterial({ map: env.glow, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const field = new THREE.Mesh(env.track(new THREE.PlaneGeometry(9, 9)), fieldMat);
  field.rotation.x = -Math.PI / 2;
  field.position.y = stageTop + 0.02;
  field.renderOrder = 2;
  group.add(field);
  // a faint beam from the stage up through the molecule
  const beamH = molY + 1.6 - stageTop;
  const coreBeamMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const coreBeam = new THREE.Mesh(env.track(new THREE.CylinderGeometry(1.5, 1.9, beamH, 32, 1, true)), coreBeamMat);
  coreBeam.position.y = stageTop + beamH / 2;
  coreBeam.renderOrder = 2;
  group.add(coreBeam);
  const scanMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }));
  const scanRing = new THREE.Mesh(env.track(new THREE.TorusGeometry(3.6, 0.025, 6, 96)), scanMat);
  scanRing.rotation.x = Math.PI / 2;
  group.add(scanRing);
  // the empty chamber: a faint wire form where a molecule would be
  const emptyMat = env.track(new THREE.LineBasicMaterial({ color: 0x55564d, transparent: true, opacity: 0.6 }));
  const emptyGeo = env.track(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.7, 1)));
  const empty = new THREE.LineSegments(emptyGeo, emptyMat);
  empty.position.y = molY;
  group.add(empty);

  // ---- projection stations: real molecules, smaller, on their own plinths ---------------------------------------
  const stations: Station[] = [];
  const arcMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const arcGroup = new THREE.Group();
  group.add(arcGroup);
  const flowGeo = env.track(new THREE.BufferGeometry());
  flowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STATIONS * 3 * 3), 3));
  const flowMat = env.track(new THREE.PointsMaterial({ map: env.glow, size: 0.5, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false }));
  const flowPts = new THREE.Points(flowGeo, flowMat);
  flowPts.frustumCulled = false;
  flowPts.renderOrder = 3;
  group.add(flowPts);
  let arcs: THREE.QuadraticBezierCurve3[] = [];
  let projKey = "";
  for (let i = 0; i < STATIONS; i++) {
    const a = (i * Math.PI) / 2;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * stationR, 1.45, Math.cos(a) * stationR);
    g.rotation.y = a;
    const holder = new THREE.Group();
    holder.position.y = 1.35;
    g.add(holder);
    const beamMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const beam = new THREE.Mesh(env.track(new THREE.CylinderGeometry(0.16, 0.6, 2.4, 20, 1, true)), beamMat);
    beam.position.y = 1.2;
    beam.renderOrder = 2;
    g.add(beam);
    // the plaque faces outward from the core
    const plaque = env.track(new Screen(1.7, 0.55, 340));
    plaque.mesh.position.set(0, -0.05, 0.95);
    plaque.mesh.rotation.x = -0.5;
    plaque.mesh.visible = false;
    g.add(plaque.mesh);
    group.add(g);
    stations.push({ group: g, molHolder: holder, mol: null, plaque, beamMat, key: "" });
  }
  const setProjections = (kind: "route" | "analogue" | "none", items: Projection[]) => {
    arcGroup.children.slice().forEach((c) => {
      arcGroup.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    });
    arcs = [];
    stations.forEach((st, i) => {
      if (st.mol) {
        st.molHolder.remove(st.mol.group);
        st.mol.dispose();
        st.mol = null;
      }
      const it = items[i];
      const m = it ? getMolecule(it.smiles) : null;
      st.key = it && m?.ok ? it.smiles : "";
      if (it && m?.ok) {
        st.mol = createMoleculeMesh(m.molecule);
        st.mol.group.scale.setScalar(THREE.MathUtils.clamp(0.8 / Math.max(m.molecule.radius, 0.8), 0.2, 0.9));
        st.molHolder.add(st.mol.group);
        st.plaque.draw(`${it.smiles}|${it.role}|${it.note}`, (g, W, H) => {
          g.fillStyle = INK.bg;
          g.fillRect(0, 0, W, H);
          g.fillStyle = kind === "route" ? "#8faf9a" : "#b87552";
          g.fillRect(0, 0, 5, H);
          text(g, it.role, 18, H * 0.16, Math.round(H * 0.21), INK.dim);
          text(g, it.note, 18, H * 0.55, Math.round(H * 0.28), INK.text);
        });
      }
      st.plaque.mesh.visible = st.key !== "";
    });
    // route arcs: each starting material to the target
    if (kind === "route") {
      const end = new THREE.Vector3(0, molY, 0);
      stations.forEach((st) => {
        if (!st.key) return;
        const from = new THREE.Vector3(st.group.position.x, 2.8, st.group.position.z);
        const mid = from.clone().lerp(end, 0.5);
        mid.y += 2.6;
        const curve = new THREE.QuadraticBezierCurve3(from, mid, end);
        arcs.push(curve);
        arcGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.022, 5, false), arcMat));
      });
    }
  };

  // console screens
  const sc = [0, 1, 2, 3].map((i) => {
    const s = env.track(new Screen(2.2, 1.25, 400));
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    s.mesh.position.set(Math.sin(a) * (consoleR - 0.3), 2.42, Math.cos(a) * (consoleR - 0.3));
    s.mesh.rotation.y = a + Math.PI;
    s.mesh.rotation.x = -0.32;
    group.add(s.mesh);
    return s;
  });

  const hit = new THREE.Mesh(env.track(new THREE.CylinderGeometry(chamberR + 0.2, chamberR + 0.2, glassH + 0.6, 24)), env.track(new THREE.MeshBasicMaterial({ visible: false })));
  hit.position.y = 0.6 + glassH / 2;
  hit.userData = { zone: "core" };
  group.add(hit);

  let molKey = "";
  const col = new THREE.Color();
  const anchor = new THREE.Vector3(0, 12.6, 0);
  const moleculeAnchor = new THREE.Vector3(0, molY, 0);
  const tmpP = new THREE.Vector3();

  const setMolecule = (mol: Molecule | null) => {
    if (molMesh) {
      molGroup.remove(molMesh.group);
      molMesh.dispose();
      molMesh = null;
    }
    empty.visible = mol === null;
    if (mol) {
      molMesh = createMoleculeMesh(mol);
      const s = THREE.MathUtils.clamp(3.3 / Math.max(mol.radius, 0.8), 0.3, 2.9);
      molMesh.group.scale.setScalar(s);
      molGroup.add(molMesh.group);
    }
  };

  return {
    id: "core",
    group,
    hit: [hit],
    anchor,
    moleculeAnchor,
    setMolecule,
    pickAtom: (ray) => (molMesh ? molMesh.pick(ray) : null),
    pickBond: (ray) => (molMesh ? molMesh.pickBond(ray) : null),
    setAtomHighlight: (a) => molMesh?.setHighlight(a),
    setBondHighlight: (b) => molMesh?.setBondHighlight(b),
    update(u: ZoneUpdate) {
      const s = u.s;
      const running = s.phase === "running";
      // the core's own tone: awaiting / analysing / complete / the run failed
      const alive = s.target !== null;
      col.copy(u.color);
      accMat.color.copy(col).multiplyScalar(0.3 + 0.7 * u.glow + u.hover * 0.2 + u.flash * 0.5);
      fieldMat.color.copy(col);
      fieldMat.opacity = alive ? 0.24 + 0.18 * u.glow : 0.05;
      coreBeamMat.color.copy(col);
      coreBeamMat.opacity = alive ? 0.045 + 0.05 * u.glow : 0;
      scanMat.color.copy(col);
      const sweep = running && alive ? (u.t * 0.3) % 1 : 0.5;
      scanRing.position.y = stageTop + 0.4 + sweep * 5.6;
      scanRing.visible = alive;
      (scanMat as THREE.MeshBasicMaterial).opacity = running && alive ? 0.55 : 0.18;
      emptyMat.color.copy(col);
      empty.rotation.y = u.t * 0.1;
      empty.rotation.x = u.t * 0.06;

      gantry.rotation.y += u.dt * (running && alive ? 0.5 : 0.07);
      arms.forEach((a, i) => (a.rotation.z = Math.sin(u.t * (running ? 0.9 : 0.25) + i * 2) * 0.12));
      molGroup.rotation.y += u.dt * (running ? 0.3 : 0.15);
      molGroup.position.y = molY + Math.sin(u.t * 0.7) * 0.07;

      const mol = s.target ? getMolecule(s.target.smiles) : null;
      const key = s.target?.smiles ?? "";
      if (key !== molKey) {
        molKey = key;
        setMolecule(mol?.ok ? mol.molecule : null);
      }

      // projections: real molecules only (the route's starting materials, or research analogues)
      const proj = projectionsOf(s.result);
      const pk = `${proj.kind}|${proj.items.map((p) => p.smiles).join(",")}`;
      if (pk !== projKey) {
        projKey = pk;
        setProjections(proj.kind, proj.items);
      }
      arcMat.color.copy(col);
      arcMat.opacity = 0.3 + 0.35 * u.glow;
      stations.forEach((st, i) => {
        st.beamMat.color.copy(col);
        st.beamMat.opacity = st.key !== "" ? 0.07 + 0.05 * u.glow : 0;
        st.plaque.level(0.5 + 0.4 * u.glow);
        if (st.mol) st.mol.group.rotation.y += u.dt * (0.2 + 0.05 * i);
        st.molHolder.position.y = 1.35 + Math.sin(u.t * 0.6 + i * 1.7) * 0.05;
      });
      // the route's direction of travel: light drifting from each starting material to the target
      const fp = flowGeo.getAttribute("position") as THREE.BufferAttribute;
      let n = 0;
      arcs.forEach((c, i) => {
        for (let j = 0; j < 3; j++) {
          c.getPoint((((u.t * (running ? 0.16 : 0.05) + j / 3 + i * 0.11) % 1) + 1) % 1, tmpP);
          fp.setXYZ(n++, tmpP.x, tmpP.y, tmpP.z);
        }
      });
      for (; n < fp.count; n++) fp.setXYZ(n, 0, -60, 0);
      fp.needsUpdate = true;
      flowMat.color.copy(col);

      // console displays: real values only
      const p = s.result?.profile?.properties;
      const props = p && !("error" in p) ? (p as MolecularProperties) : null;
      const dim = 0.35 + 0.65 * Math.max(u.glow, 0.3);
      const m = mol?.ok ? mol.molecule : null;
      sc.forEach((sr) => sr.level(dim));
      sc[0].draw(`0|${s.target?.smiles}|${s.target?.name}`, (g, W, H) => {
        const y = frame(g, W, H, "TARGET", s.target ? "resolved" : "none");
        if (!s.target) return void text(g, s.awake ? "no target resolved" : "no run selected", 20, y + 8, 20, INK.dim);
        if (s.target.name) text(g, s.target.name, 20, y + 2, 26, INK.text);
        paragraph(g, s.target.smiles, 20, y + 40, W - 40, 16, INK.dim, 4);
      });
      sc[1].draw(`1|${s.target?.smiles}`, (g, W, H) => {
        let y = frame(g, W, H, "COMPOSITION", m ? "from SMILES" : "none");
        if (!m) return void text(g, "not available", 20, y + 8, 20, INK.dim);
        const mw = molecularWeight(m.graph);
        for (const [k, v] of [["FORMULA", m.formula], ["MOL. WEIGHT", mw !== null ? `${mw.toFixed(2)}` : "not reported"], ["HEAVY ATOMS", String(m.graph.atoms.length)]] as [string, string][]) {
          text(g, k, 20, y, 15, INK.dim);
          text(g, v, W - 20, y - 2, 20, INK.text, "right");
          y += 34;
        }
      });
      sc[2].draw(`2|${s.target?.smiles}`, (g, W, H) => {
        let y = frame(g, W, H, "STRUCTURE", m ? "bond graph" : "none");
        if (!m) return void text(g, "not available", 20, y + 8, 20, INK.dim);
        const arom = m.graph.atoms.filter((a) => a.aromatic).length;
        for (const [k, v] of [["BONDS", String(m.graph.bonds.length)], ["RINGS", String(ringCount(m.graph))], ["AROMATIC ATOMS", String(arom)]] as [string, string][]) {
          text(g, k, 20, y, 15, INK.dim);
          text(g, v, W - 20, y - 2, 20, INK.text, "right");
          y += 34;
        }
      });
      sc[3].draw(`3|${props?.inchikey ?? ""}|${s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "PROFILE", props ? "RDKit · backend" : "not reported");
        if (!props) return void text(g, s.awake ? "the research agent has not reported" : "no run", 20, y + 8, 16, INK.dim);
        for (const [k, v] of [["LogP", props.logp.toFixed(2)], ["TPSA", `${props.tpsa.toFixed(1)}`], ["HBD / HBA", `${props.hbd} / ${props.hba}`]] as [string, string][]) {
          text(g, k, 20, y, 15, INK.dim);
          text(g, v, W - 20, y - 2, 20, INK.text, "right");
          y += 34;
        }
      });
    },
    dispose() {
      molMesh?.dispose();
      stations.forEach((st) => {
        st.mol?.dispose();
        st.plaque.dispose();
      });
      arcGroup.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
      acc.dispose();
      accMesh?.geometry.dispose();
      sc.forEach((s) => s.dispose());
    },
  };
}

// ---- the planner's gallery -------------------------------------------------------------------------------

const TASKS = 24;
const DECK_Y = 4.6;
const GAP = 0.62; // half-angle of the south opening, radians: the way in

export function buildPlanner(env: BuildEnv): ZoneRig {
  const def = ZONES.planner;
  const group = new THREE.Group();
  const acc = new Batch();
  const seg = 30;
  const a0 = GAP;
  const a1 = Math.PI * 2 - GAP;
  const at = (th: number, r: number): [number, number] => [Math.sin(th) * r, Math.cos(th) * r];

  // the deck: an annulus in segments, with edge lights, rails and columns
  for (let i = 0; i < seg; i++) {
    const th = a0 + ((i + 0.5) / seg) * (a1 - a0);
    const [x, z] = at(th, 10.1);
    const len = (10.1 * (a1 - a0)) / seg;
    env.metal.box(len * 1.03, 0.3, 3.0, x, DECK_Y - 0.15, z, C.metal, th);
    env.matte.box(len * 1.0, 0.03, 2.7, x, DECK_Y + 0.02, z, 0x24251f, th);
    const [ix, iz] = at(th, 8.62);
    const [ox, oz] = at(th, 11.58);
    acc.box(len, 0.05, 0.07, ix, DECK_Y + 0.05, iz, 0xffffff, th);
    acc.box(len, 0.05, 0.07, ox, DECK_Y + 0.05, oz, 0xffffff, th);
  }
  const N = 40;
  for (let i = 0; i < N; i++) {
    const t0 = a0 + (i / N) * (a1 - a0);
    const t1 = a0 + ((i + 1) / N) * (a1 - a0);
    for (const r of [8.55, 11.65]) {
      const [x0, z0] = at(t0, r);
      const [x1, z1] = at(t1, r);
      railing(env, x0, z0, x1, z1, DECK_Y, 1.0, r < 10);
    }
  }
  for (let k = 0; k < 9; k++) {
    const th = a0 + 0.3 + (k * (a1 - a0 - 0.6)) / 8;
    const [x, z] = at(th, 10.1);
    env.metal.cyl(0.24, 0.3, DECK_Y - 0.3, x, (DECK_Y - 0.3) / 2, z, C.metal, 14);
  }
  // the stair down, outward from the deck's east end
  const th = 1.25;
  for (let i = 0; i < 14; i++) {
    const r = 11.9 + i * 0.28;
    const [x, z] = at(th, r);
    env.metal.box(1.5, 0.12, 0.3, x, DECK_Y - 0.08 - i * (DECK_Y / 14), z, C.steel, th);
  }
  const accMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));

  // the planner's console: a holotable, the task orbit, and the orchestration display behind it
  const cons = makeConsole(env, acc, def);
  const accMesh = acc.build(accMat, false);
  if (accMesh) group.add(accMesh);
  group.add(cons.group);

  const anchor = new THREE.Vector3(def.x, DECK_Y + 4.5, def.z);
  return {
    id: "planner",
    group,
    hit: [cons.hit],
    anchor,
    update(u: ZoneUpdate) {
      accMat.color.copy(u.color).multiplyScalar(0.3 + 0.7 * u.glow + u.hover * 0.25 + u.flash * 0.5);
      cons.update(u);
    },
    dispose() {
      acc.dispose();
      accMesh?.geometry.dispose();
      cons.dispose();
    },
  };
}

function makeConsole(env: BuildEnv, acc: Batch, def: (typeof ZONES)["planner"]) {
  const group = new THREE.Group();
  group.position.set(def.x, def.floor, def.z);
  group.rotation.y = Math.atan2(-def.x, -def.z);
  withZone(env, def, () => {
    env.metal.cyl(1.35, 1.5, 0.9, 0, 0.45, 0, C.metal, 28);
    env.metal.cyl(1.25, 1.25, 0.08, 0, 0.94, 0, C.steel, 28);
    env.matte.cyl(1.1, 1.1, 0.03, 0, 0.99, 0, 0x0f100e, 28);
    env.metal.cyl(0.06, 0.06, 2.2, 0, 2.1, 0, C.brushed, 8);
    // the display frame behind the table
    env.metal.box(0.14, 3.6, 0.14, -3.1, 1.8, -2.2, C.metal);
    env.metal.box(0.14, 3.6, 0.14, 3.1, 1.8, -2.2, C.metal);
    env.metal.box(6.4, 0.14, 0.14, 0, 3.7, -2.2, C.brushed);
    env.metal.box(6.4, 0.14, 0.14, 0, 0.25, -2.2, C.brushed);
    for (const sx of [-1, 1]) env.metal.box(1.2, 0.9, 0.9, sx * 2.6, 0.45, 0.4, C.metal);
  });
  acc.push(new THREE.Matrix4().compose(new THREE.Vector3(def.x, def.floor, def.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-def.x, -def.z)), new THREE.Vector3(1, 1, 1)));
  acc.geo(new THREE.TorusGeometry(1.32, 0.03, 6, 40), 0, 0.99, 0, 0xffffff, 1, 0, Math.PI / 2);
  acc.geo(new THREE.TorusGeometry(2.7, 0.025, 6, 60), 0, 0.06, 0, 0xffffff, 1, 0, Math.PI / 2);
  acc.pop();

  // the task orbit: one token per real task, coloured by its status
  const tokGeo = env.track(new THREE.BoxGeometry(0.34, 0.06, 0.22));
  const tokMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const tokens = new THREE.InstancedMesh(tokGeo, tokMat, TASKS);
  tokens.count = 0;
  tokens.frustumCulled = false;
  const orbit = new THREE.Group();
  orbit.position.y = 1.7;
  orbit.add(tokens);
  group.add(orbit);

  const screen = env.track(new Screen(6.0, 3.3, 640));
  screen.mesh.position.set(0, 2.0, -2.1);
  group.add(screen.mesh);

  const hit = new THREE.Mesh(env.track(new THREE.BoxGeometry(7, 5, 5)), env.track(new THREE.MeshBasicMaterial({ visible: false })));
  hit.position.set(0, 2.5, -0.4);
  hit.userData = { zone: "planner" };
  group.add(hit);

  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  let key = "";
  const STATUS_HEX = { PENDING: 0x6a685c, RUNNING: 0x8faf9a, COMPLETED: 0xe8e4d8, FAILED: 0xb5533c } as const;

  return {
    group,
    hit,
    update(u: ZoneUpdate) {
      const tasks = u.s.tasks.slice(-TASKS);
      const k = tasks.map((t) => `${t.id}${t.status}`).join("|");
      if (k !== key) {
        key = k;
        tokens.count = tasks.length;
        tasks.forEach((t, i) => {
          const ring = i % 2;
          const a = (i / tasks.length) * Math.PI * 2;
          const r = 1.9 + ring * 0.6;
          tmp.position.set(Math.cos(a) * r, ring * 0.16, Math.sin(a) * r);
          tmp.rotation.set(0, -a, 0);
          tmp.scale.setScalar(1);
          tmp.updateMatrix();
          tokens.setMatrixAt(i, tmp.matrix);
          tokens.setColorAt(i, col.setHex(STATUS_HEX[t.status]));
        });
        tokens.instanceMatrix.needsUpdate = true;
        if (tokens.instanceColor) tokens.instanceColor.needsUpdate = true;
      }
      orbit.rotation.y += u.dt * (u.z?.busy ? 0.45 : 0.08);
      const dim = 0.3 + 0.7 * Math.max(u.glow, 0.25);
      screen.level(dim);
      const st = { PENDING: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 };
      for (const t of u.s.tasks) st[t.status]++;
      const failure = u.z?.activity === "failed" ? (u.z.error ?? "planner failed") : null;
      screen.draw(`S|${u.s.awake}|${u.s.phase}|${u.s.params?.topN}|${u.s.params?.iterationLimit}|${JSON.stringify(st)}|${u.s.target?.smiles}|${u.z?.task}|${failure}|${u.s.replan.count}`, (g, W, H) => {
        let y = frame(g, W, H, "ORCHESTRATION", failure ? "FAILED" : u.s.phase === "none" ? "no run" : u.s.phase.toUpperCase(), failure ? "#b5533c" : INK.accent);
        if (failure) return void paragraph(g, failure, 28, y + 8, W - 56, 22, INK.text, 5);
        if (!u.s.awake) return void text(g, "no run selected", 28, y + 10, 26, INK.dim);
        const rows: [string, string][] = [
          ["TARGET", u.s.target ? (u.s.target.name ?? u.s.target.smiles).slice(0, 26) : "not resolved"],
          ["SEARCH BUDGET", u.s.params ? `${u.s.params.iterationLimit} iterations · top ${u.s.params.topN}` : "not reported"],
          ["TASKS", `${st.COMPLETED} done · ${st.RUNNING} running · ${st.PENDING} pending${st.FAILED ? ` · ${st.FAILED} failed` : ""}`],
          ["REPLANS", String(u.s.replan.count)],
          ["NOW", u.z?.task ?? "—"],
        ];
        for (const [k2, v] of rows) {
          text(g, k2, 28, y, 16, INK.dim);
          text(g, v, W - 28, y - 1, 20, INK.text, "right");
          y += 36;
        }
      });
    },
    dispose() {
      tokens.dispose();
      screen.dispose();
    },
  };
}

void TONE_LOOK;
