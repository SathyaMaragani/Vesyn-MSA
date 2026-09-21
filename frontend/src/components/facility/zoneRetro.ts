// RETROSYNTHESIS: the synthesis hall, the facility's strongest room. A route table carries the route as a
// 3D graph (molecules and reactions from the REAL route tree once the run has one); a rail of cassettes
// shows the candidate routes of the newest attempt as the backend reports them; a reactor and benches
// surround it. If retrosynthesis fails, the hall says so in the backend's own words.
import * as THREE from "three";
import { layoutRoute } from "../../lib/events/routeGraph.ts";
import { flattenSteps, leafMolecules } from "../../lib/events/routeSteps.ts";
import type { RankedRoute } from "../../types/routes.ts";
import { ASSESSMENT_HEX, shownRoute } from "./facilityState";
import { ZONES } from "./layout";
import { C } from "./kit";
import { INK, Screen, bar, drawMolecule2D, frame, paragraph, text } from "./screen";
import { bench, beaker, cabinet, flask, makeFrame, tube, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

const MAX_CASSETTES = 8;
const MAX_NODES = 48;
const MAX_RXN = 24;
const VIALS = 36;
const TABLE = new THREE.Vector3(0, 0, 2);

export function buildRetro(env: BuildEnv): ZoneRig {
  const def = ZONES.retro;
  const f = makeFrame(env, def);
  const { d } = def;
  const wallZ = -d / 2 + 0.44;

  withZone(env, def, () => {
    // the route table: a raised round table, a dark display top
    env.metal.cyl(3.9, 4.1, 0.34, TABLE.x, 0.5, TABLE.z, C.metal, 40);
    env.metal.cyl(3.6, 3.6, 0.36, TABLE.x, 0.85, TABLE.z, C.brushed, 40);
    env.matte.cyl(3.3, 3.3, 0.04, TABLE.x, 1.05, TABLE.z, 0x0f100e, 40);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      env.metal.box(0.22, 1.0, 0.22, Math.cos(a) * 4.3, 0.85, TABLE.z + Math.sin(a) * 4.3, C.metal);
    }
    // the reactor column (glass) with caps and piping to the ceiling
    env.glass.cyl(0.95, 0.95, 4.6, -5.6, 2.9, -7.6, C.glass, 24);
    env.metal.cyl(1.1, 1.1, 0.3, -5.6, 0.47, -7.6, C.brushed, 24);
    env.metal.cyl(1.1, 1.1, 0.3, -5.6, 5.3, -7.6, C.brushed, 24);
    env.metal.cyl(0.12, 0.12, 2.2, -5.6, 6.5, -7.6, C.copper, 10);
    env.metal.cyl(0.09, 0.09, 6.0, -4.2, 3.4, -9.8, C.copper, 8);
    env.metal.box(1.4, 0.1, 0.1, -4.9, 6.4, -8.8, C.copper);
    // benches with glassware along both glass walls
    for (const sx of [-1, 1]) {
      for (const z of [-4.2, 5.2]) {
        bench(env, sx * 6.2, z, 5.4, Math.PI / 2);
        for (let k = 0; k < 3; k++) {
          const zz = z - 1.6 + k * 1.6;
          flask(env, sx * 6.2, 1.3, zz, 1, [C.amber, C.mineral, C.copper][(k + (sx > 0 ? 1 : 0)) % 3]);
          beaker(env, sx * 6.2 + 0.35, 1.3, zz + 0.4, 0.9);
        }
        tube(env, sx * 6.6, 1.3, z, 1.4, 0.04);
        env.metal.box(0.5, 0.08, 0.5, sx * 6.2, 1.34, z + 1.9, C.steel); // hotplate
      }
    }
    // storage: cabinets under the vial shelf, and along the east wall
    for (const x of [-7.3, -5.9, -4.5]) cabinet(env, x, wallZ + 0.7, 1.35, 1.0, 0.6, 0);
    for (const z of [-8, -6.4]) cabinet(env, 7.2, z, 1.4, 2.1, 0.6, -Math.PI / 2);
    // the cassette rail in front of the table
    env.metal.box(8.4, 0.1, 0.5, 0, 0.42, 7.6, C.brushed);
    env.metal.box(8.6, 0.14, 0.14, 0, 0.33, 7.9, C.metal);
    // vial shelf (three shelves, the back wall, west)
    for (let r = 0; r < 3; r++) env.metal.box(3.3, 0.05, 0.4, -5.9, 1.1 + r * 0.55, wallZ + 0.2, C.steel);
  });

  // ---- displays -----------------------------------------------------------------------------------------
  const sRoute = env.track(new Screen(7.2, 3.4, 720));
  sRoute.mesh.position.set(0.6, 2.75, wallZ);
  const sSteps = env.track(new Screen(3.2, 2.5, 384));
  sSteps.mesh.position.set(6.0, 2.4, wallZ);
  f.group.add(sRoute.mesh, sSteps.mesh);

  // ---- vials: real starting materials light their own ---------------------------------------------------
  const vialGeo = env.track(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8));
  const vialMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const vials = new THREE.InstancedMesh(vialGeo, vialMat, VIALS);
  vials.frustumCulled = false;
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < VIALS; i++) {
      m.makeTranslation(-7.3 + (i % 12) * 0.27, 1.25 + Math.floor(i / 12) * 0.55, wallZ + 0.25);
      vials.setMatrixAt(i, m);
      vials.setColorAt(i, new THREE.Color(0x2a2b26));
    }
  }
  f.group.add(vials);

  // ---- candidate-route cassettes (the live routes of the newest attempt) -----------------------------------
  const casGeo = env.track(new THREE.BoxGeometry(0.5, 1, 0.16));
  const casMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const cassettes = new THREE.InstancedMesh(casGeo, casMat, MAX_CASSETTES);
  cassettes.count = 0;
  cassettes.frustumCulled = false;
  f.group.add(cassettes);

  // ---- the route graph over the table --------------------------------------------------------------------
  const graph = new THREE.Group();
  graph.position.set(TABLE.x, 1.4, TABLE.z);
  const molGeo = env.track(new THREE.SphereGeometry(1, 14, 10));
  const molMat = env.track(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2, emissive: 0x111111 }));
  const mols = new THREE.InstancedMesh(molGeo, molMat, MAX_NODES);
  mols.count = 0;
  mols.frustumCulled = false;
  const rxnGeo = env.track(new THREE.OctahedronGeometry(1, 0));
  const rxnMat = env.track(new THREE.MeshBasicMaterial({ color: C.copper, toneMapped: false }));
  const rxns = new THREE.InstancedMesh(rxnGeo, rxnMat, MAX_RXN);
  rxns.count = 0;
  rxns.frustumCulled = false;
  const edgeGeo = env.track(new THREE.BufferGeometry());
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((MAX_NODES + MAX_RXN) * 2 * 3), 3));
  edgeGeo.setDrawRange(0, 0);
  const edgeMat = env.track(new THREE.LineBasicMaterial({ color: 0xcfc8b4, transparent: true, opacity: 0.55 }));
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.frustumCulled = false;
  graph.add(mols, rxns, edges);
  const holoMat = env.track(new THREE.MeshBasicMaterial({ map: env.glow, color: C.sage, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const holo = new THREE.Mesh(env.track(new THREE.PlaneGeometry(8, 8)), holoMat);
  holo.rotation.x = -Math.PI / 2;
  holo.position.set(TABLE.x, 1.12, TABLE.z);
  holo.renderOrder = 2;
  f.group.add(holo, graph);
  // with no route to show, the table idles: two scan rings, nothing that looks like data
  const idleMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false }));
  const idle = new THREE.Group();
  for (const [r, seg] of [[2.7, 96], [1.7, 72]] as [number, number][]) {
    const ring = new THREE.Mesh(env.track(new THREE.TorusGeometry(r, 0.018, 6, seg)), idleMat);
    ring.rotation.x = Math.PI / 2;
    idle.add(ring);
  }
  idle.position.set(TABLE.x, 1.1, TABLE.z);
  f.group.add(idle);

  // reactor liquid + bubbles (state-coloured, in the accent batch)
  f.acc.cyl(0.74, 0.74, 2.7, -5.6, 1.9, -7.6, 0xffffff, 20);
  f.acc.geo(new THREE.TorusGeometry(3.42, 0.05, 6, 72), TABLE.x, 1.09, TABLE.z, 0xffffff, 1, 0, Math.PI / 2);
  f.acc.sphere(0.22, def.w / 2 - 0.5, 6.1, -d / 2 + 0.6, 0xffffff); // the status lamp
  f.finish();
  const bubblesGeo = env.track(new THREE.BufferGeometry());
  const bub = new Float32Array(36 * 3);
  bubblesGeo.setAttribute("position", new THREE.BufferAttribute(bub, 3));
  const bubbles = new THREE.Points(bubblesGeo, env.track(new THREE.PointsMaterial({ color: 0xe8e4d8, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false })));
  bubbles.frustumCulled = false;
  f.group.add(bubbles);

  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  let casKey = "";
  let graphKey = "";
  let vialKey = "";
  const anchor = new THREE.Vector3(def.x, 6.6, def.z);

  const rebuildGraph = (route: RankedRoute | null) => {
    if (!route) {
      mols.count = 0;
      rxns.count = 0;
      edgeGeo.setDrawRange(0, 0);
      return;
    }
    const lay = layoutRoute(route.tree);
    const k = Math.min(6.6 / Math.max(lay.width, 1), 6.2 / Math.max(lay.height, 1), 0.02);
    const ox = lay.width / 2;
    const oz = lay.height / 2;
    const pos = new Map<string, THREE.Vector3>();
    let mi = 0;
    for (const m of lay.mols.slice(0, MAX_NODES)) {
      const p = new THREE.Vector3((m.x + 76 - ox) * k, 0.25 + (m.isTarget ? 0.5 : 0) + (m.x / 240) * 0.3, (m.y - oz) * k);
      pos.set(m.id, p);
      tmp.position.copy(p);
      tmp.scale.setScalar(m.isTarget ? 0.3 : m.leaf ? 0.17 : 0.2);
      tmp.updateMatrix();
      mols.setMatrixAt(mi, tmp.matrix);
      mols.setColorAt(mi, col.set(m.isTarget ? C.ivory : m.leaf ? (m.inStock ? C.sage : C.amber) : C.stone));
      mi++;
    }
    mols.count = mi;
    mols.instanceMatrix.needsUpdate = true;
    if (mols.instanceColor) mols.instanceColor.needsUpdate = true;
    let ri = 0;
    for (const r of lay.rxns.slice(0, MAX_RXN)) {
      const p = new THREE.Vector3((r.x + 23 + 76 - ox) * k, 0.25 + (r.x / 240) * 0.3 + 0.1, (r.y - oz) * k);
      pos.set(r.id, p);
      tmp.position.copy(p);
      tmp.scale.setScalar(0.11);
      tmp.updateMatrix();
      rxns.setMatrixAt(ri++, tmp.matrix);
    }
    rxns.count = ri;
    rxns.instanceMatrix.needsUpdate = true;
    const a = edgeGeo.getAttribute("position") as THREE.BufferAttribute;
    let ei = 0;
    for (const e of lay.edges) {
      const p = pos.get(e.from);
      const q = pos.get(e.to);
      if (!p || !q) continue;
      a.setXYZ(ei++, p.x, p.y, p.z);
      a.setXYZ(ei++, q.x, q.y, q.z);
    }
    a.needsUpdate = true;
    edgeGeo.setDrawRange(0, ei);
  };

  return {
    id: "retro",
    group: f.group,
    hit: [f.hit],
    anchor,
    update(u: ZoneUpdate) {
      f.update(u);
      const z = u.z;
      const busy = !!z?.busy;
      const dim = 0.3 + 0.7 * Math.max(u.glow, 0.25);
      const route = shownRoute(u.s.result);
      const current = u.s.current;

      // the 3D route: rebuilt only when the displayed route changes
      const gk = route ? `${route.db_id}|${route.route_id}` : "";
      if (gk !== graphKey) {
        graphKey = gk;
        rebuildGraph(route);
      }
      graph.rotation.y = Math.sin(u.t * 0.15) * 0.25;
      holoMat.opacity = route ? 0.16 + 0.12 * u.glow : 0.05;
      holoMat.color.copy(u.color);
      idle.visible = !route;
      idle.rotation.y += u.dt * (busy ? 0.6 : 0.08);
      idleMat.color.copy(u.color);
      idleMat.opacity = 0.25 + 0.4 * u.glow;

      // cassettes: the live routes of the newest attempt
      const ck = current.map((r) => `${r.routeId}:${r.steps}:${r.assessment}:${r.validating}`).join("|");
      if (ck !== casKey) {
        casKey = ck;
        const n = Math.min(MAX_CASSETTES, current.length);
        cassettes.count = n;
        for (let i = 0; i < n; i++) {
          const r = current[i];
          const h = 0.5 + Math.max(1, r.steps ?? 1) * 0.32;
          tmp.position.set((i - (n - 1) / 2) * 0.95, 0.45 + h / 2, 7.6);
          tmp.scale.set(1, h, 1);
          tmp.updateMatrix();
          cassettes.setMatrixAt(i, tmp.matrix);
          cassettes.setColorAt(i, col.setHex(r.assessment ? ASSESSMENT_HEX[r.assessment] : r.validating ? 0xd6a45b : 0x8faf9a));
        }
        cassettes.instanceMatrix.needsUpdate = true;
        if (cassettes.instanceColor) cassettes.instanceColor.needsUpdate = true;
      }

      // vials: sage = starting material in stock, amber = not in stock (from the displayed route)
      const mats = route?.starting_materials ?? [];
      const vk = mats.map((m) => `${m.smiles}${m.in_stock}`).join("|");
      if (vk !== vialKey) {
        vialKey = vk;
        for (let i = 0; i < VIALS; i++) {
          const m = mats[i];
          vials.setColorAt(i, col.setHex(m ? (m.in_stock ? C.sage : C.amber) : 0x2a2b26));
        }
        if (vials.instanceColor) vials.instanceColor.needsUpdate = true;
      }

      // bubbles rise in the reactor only while the agent works
      const arr = bubblesGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 36; i++) {
        if (busy) {
          const ph = (u.t * 0.5 + i / 36) % 1;
          arr.setXYZ(i, -5.6 + Math.sin(i * 12.9 + u.t) * 0.45, 0.9 + ph * 3.2, -7.6 + Math.cos(i * 7.3) * 0.45);
        } else arr.setXYZ(i, 0, -50, 0);
      }
      arr.needsUpdate = true;

      // ---- the screens ----
      const failure = z && (z.activity === "failed" || (u.s.phase === "failed" && z.error)) ? (z.error ?? u.s.error ?? "retrosynthesis failed") : null;
      sRoute.level(dim);
      sRoute.draw(`R|${failure}|${route?.db_id ?? ""}|${ck}|${u.s.awake}|${u.s.target?.smiles}|${u.s.phase}`, (g, W, H) => {
        if (failure) {
          let y = frame(g, W, H, "ROUTE", "FAILED", "#b5533c");
          text(g, "RETROSYNTHESIS", 28, y + 6, 44, "#e8e4d8");
          text(g, "FAILED", 28, y + 54, 44, "#c9694f");
          y = paragraph(g, failure, 28, y + 122, W - 56, 22, INK.text, 5);
          text(g, "reported by the backend — nothing here is simulated", 28, H - 40, 16, INK.dim);
          return;
        }
        if (route) {
          const steps = flattenSteps(route.tree);
          let y = frame(g, W, H, `ROUTE ${route.route_id} · RANK ${route.rank}`, `${route.number_of_reactions} step(s)`);
          const first = steps[0];
          drawMolecule2D(g, route.tree.molecule_smiles, 16, y, W * 0.3, H - y - 60, INK.text);
          text(g, "TARGET", 20, H - 50, 16, INK.dim);
          if (first) {
            g.fillStyle = "#b87552";
            g.fillRect(W * 0.32, y + (H - y - 60) / 2, 44, 3);
            first.reaction.reactants.slice(0, 3).forEach((r, i, arr) => {
              const cw = (W * 0.62) / arr.length;
              drawMolecule2D(g, r.molecule_smiles, W * 0.38 + i * cw, y, cw, H - y - 60, INK.text);
              text(g, r.is_stock_available ? "IN STOCK" : "NOT IN STOCK", W * 0.38 + i * cw + cw / 2, H - 50, 15, r.is_stock_available ? INK.accent : "#d6a45b", "center");
            });
          }
          text(g, `${leafMolecules(route.tree).length} starting material(s)`, W - 24, H - 30, 16, INK.dim, "right");
          return;
        }
        let y = frame(g, W, H, "ROUTE", current.length ? `${current.length} generated` : u.s.awake ? "none yet" : "no run");
        if (current.length) {
          for (const r of current.slice(0, 5)) {
            text(g, `ROUTE ${r.routeId}`, 28, y, 22, INK.text);
            text(g, `${r.steps ?? "?"} step(s)`, 190, y, 22, INK.dim);
            text(g, r.score !== null ? `state score ${r.score.toFixed(2)}` : "score not reported", 340, y, 20, INK.dim);
            y += 40;
          }
          text(g, "the route tree arrives with the evaluator's package", 28, H - 40, 16, INK.dim);
        } else text(g, u.s.awake ? "awaiting routes from the search" : "no run selected", 28, y + 10, 26, INK.dim);
      });

      sSteps.level(dim);
      const steps = route ? flattenSteps(route.tree) : [];
      const tools = z?.tools ?? [];
      sSteps.draw(`S|${route?.db_id ?? ""}|${tools.map((t) => t.name + t.status).join(",")}`, (g, W, H) => {
        let y = frame(g, W, H, route ? "STEPS" : "TOOL LOG", route ? `${steps.length}` : `${tools.length}`);
        if (route) {
          for (const s of steps.slice(0, 5)) {
            const v = s.reaction.structural_validation?.status ?? "not reported";
            text(g, `${s.index}`, 20, y, 20, INK.accent);
            text(g, `struct ${v.toLowerCase().replace(/_/g, " ")}`, 48, y, 15, INK.text);
            text(g, `score ${s.reaction.score !== null ? s.reaction.score.toFixed(2) : "—"}`, 48, y + 19, 14, INK.dim);
            y += 46;
          }
        } else if (!tools.length) text(g, "no tool calls", 20, y + 6, 18, INK.dim);
        else
          for (const t of tools.slice(-5)) {
            const c = t.status === "COMPLETED" ? INK.accent : t.status === "FAILED" || t.status === "DENIED" ? "#c9694f" : "#d6a45b";
            text(g, t.name, 20, y, 17, INK.text);
            text(g, t.status, W - 20, y, 14, c, "right");
            y += 32;
          }
      });
    },
    dispose() {
      vials.dispose();
      cassettes.dispose();
      mols.dispose();
      rxns.dispose();
      f.dispose();
      sRoute.dispose();
      sSteps.dispose();
    },
  };
}
