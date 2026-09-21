// REPLANNER: the adaptive workshop. A monorail carries the plan through four stations - FAILED ROUTE,
// ANALYSIS, ALTERNATIVE ROUTE, NEW PLAN - and switches from the old rail to the new one. It only moves
// when the backend says a replan is running (REPLAN_STARTED ... REPLAN_COMPLETED); the budgets on the
// wall are the real previous and next search budgets. With no replan in the run it stays parked and says so.
import * as THREE from "three";
import { ZONES } from "./layout";
import { C } from "./kit";
import { INK, Screen, bar, frame, paragraph, text } from "./screen";
import { makeFrame, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

// the rail: old plan (upper), a switch, new plan (lower)
const PATH: [number, number][] = [[-5.6, -0.8], [-1.8, -0.8], [-0.3, 0.6], [1.5, 2.6], [5.6, 2.6]];
const STATIONS = [0, 1, 3, 4]; // FAILED ROUTE, ANALYSIS, ALTERNATIVE, NEW PLAN
const NAMES = ["FAILED ROUTE", "ANALYSIS", "ALTERNATIVE ROUTE", "NEW PLAN"];

const seglen = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
const total = seglen.reduce((a, b) => a + b, 0);
function pathAt(u: number): { x: number; z: number; ry: number } {
  let d = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < seglen.length; i++) {
    if (d <= seglen[i] || i === seglen.length - 1) {
      const t = seglen[i] ? Math.min(1, d / seglen[i]) : 0;
      const a = PATH[i];
      const b = PATH[i + 1];
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ry: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) };
    }
    d -= seglen[i];
  }
  return { x: PATH[0][0], z: PATH[0][1], ry: 0 };
}

export function buildReplanner(env: BuildEnv): ZoneRig {
  const def = ZONES.replanner;
  const f = makeFrame(env, def);
  const { d } = def;
  const wallZ = -d / 2 + 0.44;

  withZone(env, def, () => {
    // twin rails along the path, sleepers, and the station pads
    for (let i = 0; i < PATH.length - 1; i++) {
      const a = PATH[i];
      const b = PATH[i + 1];
      const len = seglen[i];
      const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      const cx = (a[0] + b[0]) / 2;
      const cz = (a[1] + b[1]) / 2;
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      for (const s of [-1, 1]) env.metal.box(len, 0.08, 0.07, cx + nx * 0.28 * s, 0.5, cz + nz * 0.28 * s, C.steel, ry);
      for (let t = 0.05; t < 1; t += 0.16) env.metal.box(0.1, 0.06, 0.74, a[0] + (b[0] - a[0]) * t, 0.42, a[1] + (b[1] - a[1]) * t, C.metal, ry);
    }
    STATIONS.forEach((idx) => {
      const [x, z] = PATH[idx];
      env.metal.cyl(0.95, 1.0, 0.16, x, 0.42, z, C.metal, 28);
      env.matte.cyl(0.85, 0.85, 0.03, x, 0.51, z, 0x15160f, 28);
    });
    // the turntable base at ANALYSIS and a tall analysis mast
    env.metal.cyl(0.35, 0.5, 0.5, PATH[1][0], 0.68, PATH[1][1], C.brushed, 18);
    env.metal.box(0.16, 3.0, 0.16, PATH[1][0], 2.0, PATH[1][1] - 1.7, C.metal);
    env.metal.box(0.16, 0.16, 1.9, PATH[1][0], 3.5, PATH[1][1] - 0.8, C.brushed);
    // the switch: a short rail piece and its motor housing
    env.metal.box(0.5, 0.3, 0.6, -1.0, 0.5, -0.1, C.metal);
    // workshop equipment: a bench with tools on the east side, a tool wall on the west
    env.metal.box(4.4, 0.08, 0.9, 3.2, 1.3, -4.4, C.steel);
    env.matte.box(4.3, 0.9, 0.78, 3.2, 0.86, -4.4, C.graphite);
    for (let i = 0; i < 6; i++) env.metal.box(0.04, 0.9 - (i % 3) * 0.15, 0.04, -6.9 + 0.25 * (i % 3), 2.2 - (i % 3) * 0.1, -2.5 - Math.floor(i / 3) * 0.3, C.steel);
    env.metal.box(0.1, 2.6, 4.0, -6.95, 1.7, -3.2, C.metal);
  });
  // lights along the rail: state-coloured
  PATH.slice(0, -1).forEach((a, i) => {
    const b = PATH[i + 1];
    f.acc.box(seglen[i], 0.03, 0.05, (a[0] + b[0]) / 2, 0.56, (a[1] + b[1]) / 2, 0xffffff, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  });
  f.finish();

  // the turntable, the carriage and the two plan pieces
  const turn = new THREE.Mesh(env.track(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 28)), env.track(new THREE.MeshStandardMaterial({ color: C.brushed, roughness: 0.4, metalness: 0.8 })));
  turn.position.set(PATH[1][0], 0.97, PATH[1][1]);
  const tick = new THREE.Mesh(env.track(new THREE.BoxGeometry(0.9, 0.05, 0.05)), env.track(new THREE.MeshBasicMaterial({ color: C.amber, toneMapped: false })));
  tick.position.y = 0.05;
  turn.add(tick);
  f.group.add(turn);

  const lampMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const carriage = new THREE.Group();
  carriage.add(new THREE.Mesh(env.track(new THREE.BoxGeometry(1.0, 0.36, 0.62)), env.track(new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.4, metalness: 0.8 }))));
  const top = new THREE.Mesh(env.track(new THREE.BoxGeometry(0.7, 0.08, 0.4)), lampMat);
  top.position.y = 0.22;
  carriage.add(top);
  const load = new THREE.Mesh(env.track(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 6)), env.track(new THREE.MeshStandardMaterial({ color: C.copper, roughness: 0.45, metalness: 0.5 })));
  load.position.y = 0.45;
  carriage.add(load);
  carriage.position.y = 0.66;
  f.group.add(carriage);

  const hexMat = (color: number) => env.track(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5, emissive: color, emissiveIntensity: 0.25 }));
  const hexGeo = env.track(new THREE.CylinderGeometry(0.5, 0.5, 0.26, 6));
  const failedPiece = new THREE.Mesh(hexGeo, hexMat(0x7a3d2c));
  failedPiece.position.set(PATH[0][0], 0.66, PATH[0][1]);
  const cross = new THREE.Group();
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(env.track(new THREE.BoxGeometry(0.8, 0.04, 0.07)), env.track(new THREE.MeshBasicMaterial({ color: 0x10110f })));
    b.rotation.y = s * Math.PI / 4;
    b.position.y = 0.15;
    cross.add(b);
  }
  failedPiece.add(cross);
  const newPiece = new THREE.Mesh(hexGeo, hexMat(0x8faf9a));
  newPiece.position.set(PATH[4][0], 0.66, PATH[4][1]);
  failedPiece.visible = newPiece.visible = false;
  f.group.add(failedPiece, newPiece);

  const sMain = env.track(new Screen(7.4, 3.3, 740));
  sMain.mesh.position.set(0.2, 2.75, wallZ);
  f.group.add(sMain.mesh);

  const anchor = new THREE.Vector3(def.x, 6.6, def.z);
  let carU = 0;

  return {
    id: "replanner",
    group: f.group,
    hit: [f.hit],
    anchor,
    update(u: ZoneUpdate) {
      f.update(u);
      const z = u.z;
      const rp = u.s.replan;
      const dim = 0.3 + 0.7 * Math.max(u.glow, 0.25);
      const flagged = u.s.current.some((r) => r.assessment === "REVIEW_REQUIRED") || rp.count > 0;

      // where the carriage is: parked at the failed route, cycling while a replan runs, at the new plan once done
      let target = 0;
      if (rp.active) target = (u.t * 0.13) % 1;
      else if (rp.count > 0 && rp.last?.completed) target = 1;
      carU += (target - carU) * Math.min(1, u.dt * (rp.active ? 30 : 1.6));
      const p = pathAt(carU);
      carriage.position.set(p.x, 0.66, p.z);
      carriage.rotation.y = p.ry;
      lampMat.color.copy(u.color);
      load.visible = carU < 0.95 || rp.active;
      turn.rotation.y += u.dt * (rp.active ? 1.6 : 0.15);
      failedPiece.visible = flagged;
      newPiece.visible = rp.count > 0 && !!rp.last?.completed;
      failedPiece.rotation.y = 0.4;
      newPiece.rotation.y = -u.t * 0.4;

      sMain.level(dim);
      const failure = z?.activity === "failed" ? (z.error ?? "replanning failed") : null;
      const last = rp.last;
      sMain.draw(`M|${failure}|${rp.active}|${rp.count}|${last?.completed}|${last?.reason}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "REPLAN", failure ? "FAILED" : rp.active ? "IN PROGRESS" : rp.count ? "COMPLETE" : "not needed", failure ? "#b5533c" : rp.active ? "#d6a45b" : INK.accent);
        // the four stages: lit only as far as the backend has taken the replan
        const lit = failure ? 0 : rp.active ? 2 : rp.count > 0 ? 4 : 0;
        const bw = (W - 72) / 4;
        NAMES.forEach((n, i) => {
          const on = i < lit;
          const c = i === 1 && rp.active ? "#d6a45b" : on ? (rp.count && !rp.active ? "#cdd6b8" : "#b87552") : INK.line;
          g.strokeStyle = c;
          g.lineWidth = 2;
          g.strokeRect(24 + i * (bw + 8), y + 6, bw, 84);
          g.fillStyle = on ? c : "#5a584d";
          text(g, `${i + 1}`, 24 + i * (bw + 8) + 10, y + 12, 22, on ? c : INK.dim);
          paragraph(g, n, 24 + i * (bw + 8) + 10, y + 42, bw - 16, 15, on ? INK.text : INK.dim, 2);
          if (i < 3) {
            g.fillStyle = on ? c : INK.line;
            g.fillRect(24 + (i + 1) * (bw + 8) - 8, y + 46, 8, 3);
          }
        });
        y += 110;
        if (failure) return void paragraph(g, failure, 24, y, W - 48, 21, INK.text, 4);
        if (!last) {
          text(g, u.s.awake ? "no replanning has occurred in this run" : "no run selected", 24, y + 4, 22, INK.dim);
          return;
        }
        y = paragraph(g, last.reason, 24, y, W - 48, 20, INK.text, 3) + 22;
        const rows: [string, number, number][] = [
          ["ITERATION LIMIT", last.previous.iteration_limit, last.next.iteration_limit],
          ["TOP N ROUTES", last.previous.top_n, last.next.top_n],
        ];
        for (const [k, a, b] of rows) {
          text(g, k, 24, y, 16, INK.dim);
          text(g, `${a}  →  ${b}${last.completed ? "" : " (planned)"}`, W - 24, y, 20, INK.text, "right");
          bar(g, 24, y + 24, W - 48, 5, a / Math.max(b, 1), INK.accent);
          y += 46;
        }
      });
    },
    dispose() {
      f.dispose();
      sMain.dispose();
    },
  };
}
