// EVALUATOR: the evaluation gallery. Five pillars stand under a comparison bridge. Once the evaluator's
// package exists they rise in the ranking order it produced, each capped in its validator-verdict colour,
// and the recommended route gets a light column. If the evaluator refused to recommend any route, the
// centre beacon burns copper and says so. Before that, the pillars stand for the routes seen so far,
// unranked and level: the hall does not rank what the backend has not ranked.
import * as THREE from "three";
import { ASSESSMENT_HEX, ASSESSMENT_WORD } from "./facilityState";
import { ZONES } from "./layout";
import { C } from "./kit";
import { INK, Screen, frame, paragraph, text } from "./screen";
import { makeFrame, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

const SLOTS = 5;
const RANK_SLOT = [2, 1, 3, 0, 4]; // rank 1 in the middle, then outward
const RANK_H = [2.3, 1.75, 1.4, 1.1, 0.85];
const slotX = (i: number) => (i - 2) * 2.5;
const slotZ = (i: number) => 1.5 - Math.abs(i - 2) * 0.45;

export function buildEvaluator(env: BuildEnv): ZoneRig {
  const def = ZONES.evaluator;
  const f = makeFrame(env, def);
  const { d } = def;
  const wallZ = -d / 2 + 0.44;

  withZone(env, def, () => {
    // pillar bases, the comparison bridge, the dossier wall
    for (let i = 0; i < SLOTS; i++) {
      env.metal.cyl(0.62, 0.7, 0.24, slotX(i), 0.44, slotZ(i), C.metal, 24);
    }
    env.metal.box(slotX(4) - slotX(0) + 2.6, 0.14, 0.2, 0, 4.1, 1.1, C.brushed);
    for (const sx of [-1, 1]) env.metal.box(0.14, 3.6, 0.14, sx * 6.3, 2.2, 1.1, C.metal);
    for (let r = 0; r < 3; r++) env.metal.box(5.4, 0.05, 0.5, 5.0, 1.0 + r * 0.75, -4.8, C.steel);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 9; c++) env.matte.box(0.44, 0.5, 0.28, 2.6 + c * 0.6 - 0.0, 1.32 + r * 0.75, -4.8, [0x33342d, 0x3d3c34, 0x2b2c27][(c + r) % 3]);
    env.glass.box(15, 3.7, 0.05, 0, 2.15, -d / 2 + 1.4, C.glass);
  });
  f.finish();

  // pillars: a body (dark, verdict-tinted) and a cap slab (bright verdict colour)
  const bodyGeo = env.track(new THREE.BoxGeometry(0.9, 1, 0.9));
  const bodyMat = env.track(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 }));
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, SLOTS);
  const capGeo = env.track(new THREE.BoxGeometry(1.0, 0.1, 1.0));
  const capMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const caps = new THREE.InstancedMesh(capGeo, capMat, SLOTS);
  bodies.frustumCulled = caps.frustumCulled = false;
  bodies.castShadow = true;
  f.group.add(bodies, caps);

  // the recommended route's light column and the beacon
  const colMat = env.track(new THREE.MeshBasicMaterial({ map: env.glow, color: 0xcdd6b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const column = new THREE.Mesh(env.track(new THREE.PlaneGeometry(1.7, 6)), colMat);
  column.visible = false;
  f.group.add(column);
  const beaconMat = env.track(new THREE.MeshBasicMaterial({ color: 0xb5533c, toneMapped: false }));
  const beacon = new THREE.Mesh(env.track(new THREE.OctahedronGeometry(0.34, 0)), beaconMat);
  beacon.visible = false;
  f.group.add(beacon);

  // the comparison scanner on the bridge
  const scanMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const scanner = new THREE.Mesh(env.track(new THREE.BoxGeometry(0.5, 0.2, 0.4)), scanMat);
  scanner.position.set(0, 3.95, 1.1);
  const scanBeamMat = env.track(new THREE.MeshBasicMaterial({ map: env.glow, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const scanBeam = new THREE.Mesh(env.track(new THREE.PlaneGeometry(0.9, 3.4)), scanBeamMat);
  scanBeam.position.y = -1.9;
  scanner.add(scanBeam);
  f.group.add(scanner);

  const sMain = env.track(new Screen(7.4, 3.2, 740));
  sMain.mesh.position.set(-0.6, 2.7, wallZ);
  f.group.add(sMain.mesh);

  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  let key = "";
  const anchor = new THREE.Vector3(def.x, 6.6, def.z);
  let recSlot = -1;

  return {
    id: "evaluator",
    group: f.group,
    hit: [f.hit],
    anchor,
    update(u: ZoneUpdate) {
      f.update(u);
      const z = u.z;
      const busy = !!z?.busy;
      const dim = 0.3 + 0.7 * Math.max(u.glow, 0.25);
      const ranked = u.s.ranked;
      const live = u.s.current;
      const noneRecommended = u.s.result !== null && u.s.recommendedRouteId === null && ranked.length > 0;

      const k = `${ranked.map((r) => `${r.routeId}${r.rank}${r.assessment}${r.recommended}`).join("|")}#${live.map((r) => `${r.routeId}${r.assessment}`).join("|")}#${noneRecommended}`;
      if (k !== key) {
        key = k;
        recSlot = -1;
        for (let i = 0; i < SLOTS; i++) {
          let h = 0.4;
          let hex = 0x2a2b26;
          let cap = 0x3a3b34;
          if (ranked.length) {
            const r = ranked.find((x) => RANK_SLOT[x.rank - 1] === i);
            if (r) {
              h = RANK_H[r.rank - 1] ?? 0.8;
              hex = ASSESSMENT_HEX[r.assessment];
              cap = hex;
              if (r.recommended) recSlot = i;
            }
          } else if (live[i]) {
            h = 1.0;
            hex = live[i].assessment ? ASSESSMENT_HEX[live[i].assessment as keyof typeof ASSESSMENT_HEX] : 0x8faf9a;
            cap = hex;
          }
          tmp.position.set(slotX(i), 0.56 + h / 2, slotZ(i));
          tmp.scale.set(1, h, 1);
          tmp.updateMatrix();
          bodies.setMatrixAt(i, tmp.matrix);
          bodies.setColorAt(i, col.setHex(hex).multiplyScalar(ranked.length || live[i] ? 0.34 : 0.7));
          tmp.position.y = 0.56 + h + 0.05;
          tmp.scale.set(1, 1, 1);
          tmp.updateMatrix();
          caps.setMatrixAt(i, tmp.matrix);
          caps.setColorAt(i, col.setHex(cap).multiplyScalar(ranked.length || live[i] ? 1 : 0.5));
        }
        bodies.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
        if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
        if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
        const top = ranked.find((r) => r.recommended);
        column.visible = recSlot >= 0;
        if (recSlot >= 0) column.position.set(slotX(recSlot), 0.56 + (RANK_H[(top?.rank ?? 1) - 1] ?? 1) + 3, slotZ(recSlot));
        beacon.visible = noneRecommended;
      }
      colMat.opacity = recSlot >= 0 ? 0.32 + 0.1 * Math.sin(u.t * 1.2) : 0;
      column.rotation.y = 0;
      beacon.position.set(0, 3.1 + Math.sin(u.t * 1.6) * 0.12, slotZ(2));
      beacon.rotation.y = u.t * 0.8;
      scanMat.color.copy(u.color);
      scanBeamMat.color.copy(u.color);
      scanBeamMat.opacity = busy ? 0.4 : 0;
      const sweep = busy ? Math.sin(u.t * 0.7) * 5.2 : scanner.position.x * 0.97;
      scanner.position.x += (sweep - scanner.position.x) * Math.min(1, u.dt * 3);

      sMain.level(dim);
      const failure = z?.activity === "failed" ? (z.error ?? "evaluation failed") : null;
      sMain.draw(`M|${failure}|${k}|${u.s.recommendation}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "EVALUATION", failure ? "FAILED" : u.s.result ? "FINAL" : ranked.length ? "" : u.s.awake ? "AWAITING" : "no run", failure ? "#b5533c" : noneRecommended ? "#b87552" : INK.accent);
        if (failure) return void paragraph(g, failure, 28, y + 8, W - 56, 22, INK.text, 5);
        if (ranked.length) {
          for (const r of [...ranked].sort((a, b) => a.rank - b.rank).slice(0, 5)) {
            const c = `#${ASSESSMENT_HEX[r.assessment].toString(16).padStart(6, "0")}`;
            text(g, `#${r.rank}`, 28, y, 22, r.recommended ? "#cdd6b8" : INK.dim);
            text(g, `ROUTE ${r.routeId}`, 84, y, 22, INK.text);
            text(g, `score ${r.score.toFixed(2)}`, 250, y + 2, 18, INK.dim);
            text(g, ASSESSMENT_WORD[r.assessment], W - 28, y + 2, 18, c, "right");
            y += 32;
          }
          if (u.s.recommendation) paragraph(g, u.s.recommendation, 28, H - 70, W - 56, 16, noneRecommended ? "#c98a6a" : INK.text, 3);
          return;
        }
        if (live.length) {
          text(g, "candidate routes (not yet ranked)", 28, y + 2, 17, INK.dim);
          y += 30;
          for (const r of live.slice(0, 5)) {
            text(g, `ROUTE ${r.routeId}`, 28, y, 22, INK.text);
            text(g, r.assessment ? ASSESSMENT_WORD[r.assessment] : "awaiting validation", W - 28, y + 2, 18, r.assessment ? `#${ASSESSMENT_HEX[r.assessment].toString(16).padStart(6, "0")}` : INK.dim, "right");
            y += 32;
          }
          return;
        }
        text(g, u.s.awake ? "awaiting evaluation" : "no run selected", 28, y + 10, 26, INK.dim);
      });
    },
    dispose() {
      bodies.dispose();
      caps.dispose();
      f.dispose();
      sMain.dispose();
    },
  };
}
