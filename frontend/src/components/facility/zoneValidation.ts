// VALIDATION: a glass observation room of validation cells, one per candidate route of the newest attempt.
// A cell scans (amber) while the validator is checking that route and settles on the validator's verdict
// (ivory-green = supported, amber = insufficient evidence, copper-red = review required). A flagged route
// turns the whole room's frame copper and pulses it: the environment says the validation did not pass.
import * as THREE from "three";
import { ASSESSMENT_HEX, ASSESSMENT_WORD, TONE_LOOK } from "./facilityState";
import { ZONES } from "./layout";
import { C } from "./kit";
import { INK, Screen, frame, paragraph, text } from "./screen";
import { bench, cabinet, makeFrame, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

const CELLS = 6;
const ROOM = { w: 10.6, h: 4.4, d: 8.6, z: -1.2 };

export function buildValidation(env: BuildEnv): ZoneRig {
  const def = ZONES.validator;
  const f = makeFrame(env, def, { glassLen: 12 });
  const { d } = def;
  const wallZ = -d / 2 + 0.44;
  const cellX = (i: number) => (i - (CELLS - 1) / 2) * 1.55;

  withZone(env, def, () => {
    // the observation room: glass on four sides (a gap for the door at the front), metal frame, dark floor
    const { w, h, d: rd, z } = ROOM;
    env.matte.box(w, 0.08, rd, 0, 0.36, z, 0x121310);
    env.glass.box(w, h, 0.05, 0, 0.32 + h / 2, z - rd / 2, C.glass);
    env.glass.box(0.05, h, rd, -w / 2, 0.32 + h / 2, z, C.glass);
    env.glass.box(0.05, h, rd, w / 2, 0.32 + h / 2, z, C.glass);
    env.glass.box(w * 0.36, h, 0.05, -w * 0.32, 0.32 + h / 2, z + rd / 2, C.glass);
    env.glass.box(w * 0.36, h, 0.05, w * 0.32, 0.32 + h / 2, z + rd / 2, C.glass);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) env.metal.box(0.16, h, 0.16, sx * w / 2, 0.32 + h / 2, z + sz * rd / 2, C.metal);
    for (const sz of [-1, 1]) env.metal.box(w, 0.14, 0.14, 0, 0.32 + h, z + sz * rd / 2, C.brushed);
    for (const sx of [-1, 1]) env.metal.box(0.14, 0.14, rd, sx * w / 2, 0.32 + h, z, C.brushed);
    // the cells: pedestal + glass dome
    for (let i = 0; i < CELLS; i++) {
      env.metal.cyl(0.5, 0.62, 0.9, cellX(i), 0.85, z, C.metal, 20);
      env.metal.cyl(0.55, 0.55, 0.07, cellX(i), 1.34, z, C.brushed, 20);
      env.glass.sphere(0.6, cellX(i), 1.34, z, C.glass, 1.15);
    }
    // instruments: analyser cabinets with dark windows, and spectrometers on benches
    for (const sx of [-1, 1]) {
      cabinet(env, sx * 6.6, -8.4, 1.5, 2.6, 1.0, 0);
      env.matte.box(1.0, 0.9, 0.03, sx * 6.6, 1.9, -7.88, 0x0d0e0c);
      bench(env, sx * 6.9, 5.4, 6.2, Math.PI / 2);
      env.metal.box(0.7, 0.5, 1.4, sx * 6.9, 1.6, 4.2, C.metal);
      env.metal.cyl(0.22, 0.22, 1.3, sx * 6.9, 1.42, 6.4, C.brushed, 14, 0, 0, Math.PI / 2);
    }
    // the gantry rail overhead, spanning the room
    env.metal.box(ROOM.w + 1.6, 0.16, 0.2, 0, 5.4, z, C.brushed);
    for (const sx of [-1, 1]) env.metal.box(0.16, 5, 0.16, sx * (ROOM.w / 2 + 0.7), 2.9, z, C.metal);
  });

  // state-coloured room frame + floor ring (they pulse copper on a flagged route)
  f.acc.box(ROOM.w + 0.6, 0.06, 0.1, 0, 0.4, ROOM.z + ROOM.d / 2 + 0.3, 0xffffff);
  f.acc.box(ROOM.w + 0.6, 0.06, 0.1, 0, 0.4, ROOM.z - ROOM.d / 2 - 0.3, 0xffffff);
  f.acc.box(0.1, 0.06, ROOM.d + 0.6, -ROOM.w / 2 - 0.3, 0.4, ROOM.z, 0xffffff);
  f.acc.box(0.1, 0.06, ROOM.d + 0.6, ROOM.w / 2 + 0.3, 0.4, ROOM.z, 0xffffff);
  for (const sx of [-1, 1]) f.acc.box(1.0, 0.05, 0.04, sx * 6.6, 3.2, -7.85, 0xffffff);
  f.finish();

  // rings + gems, one pair per cell (instanced, recoloured by the validator's verdict)
  const ringGeo = env.track(new THREE.TorusGeometry(0.74, 0.035, 8, 40));
  const gemGeo = env.track(new THREE.OctahedronGeometry(1, 0));
  const mat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const rings = new THREE.InstancedMesh(ringGeo, mat, CELLS);
  const gems = new THREE.InstancedMesh(gemGeo, mat, CELLS);
  rings.frustumCulled = gems.frustumCulled = false;
  f.group.add(rings, gems);

  // the scanning head on the gantry
  const scan = new THREE.Group();
  const headMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  scan.add(new THREE.Mesh(env.track(new THREE.BoxGeometry(0.6, 0.3, 0.5)), env.track(new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.4, metalness: 0.8 }))));
  const beamMat = env.track(new THREE.MeshBasicMaterial({ map: env.glow, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(env.track(new THREE.PlaneGeometry(1.1, 4.4)), beamMat);
  beam.position.y = -2.4;
  scan.add(beam);
  const eye = new THREE.Mesh(env.track(new THREE.BoxGeometry(0.3, 0.06, 0.3)), headMat);
  eye.position.y = -0.17;
  scan.add(eye);
  scan.position.set(0, 5.1, ROOM.z);
  f.group.add(scan);

  const sMain = env.track(new Screen(6.6, 3.0, 640));
  sMain.mesh.position.set(-2.4, 2.7, wallZ);
  const sTools = env.track(new Screen(3.2, 2.3, 384));
  sTools.mesh.position.set(4.6, 2.4, wallZ);
  f.group.add(sMain.mesh, sTools.mesh);

  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  const anchor = new THREE.Vector3(def.x, 6.6, def.z);

  return {
    id: "validator",
    group: f.group,
    hit: [f.hit],
    anchor,
    update(u: ZoneUpdate) {
      f.update(u);
      const z = u.z;
      const busy = !!z?.busy;
      const routes = u.s.current;
      const flagged = routes.some((r) => r.assessment === "REVIEW_REQUIRED");
      const dim = 0.3 + 0.7 * Math.max(u.glow, 0.25);
      const beat = 0.65 + 0.35 * Math.sin(u.t * 2 * Math.PI * (TONE_LOOK[z?.tone ?? "idle"].pulse || 0.8));

      for (let i = 0; i < CELLS; i++) {
        const r = routes[i];
        let hex = 0x2a2b26;
        let k = 0.5;
        if (r) {
          if (r.assessment) {
            hex = ASSESSMENT_HEX[r.assessment];
            k = r.assessment === "REVIEW_REQUIRED" ? 0.6 + 0.4 * beat : 0.95;
          } else if (r.validating || busy) {
            hex = 0xd6a45b;
            k = 0.6 + 0.4 * Math.sin(u.t * 6 + i);
          } else {
            hex = 0x8faf9a;
            k = 0.45;
          }
        }
        col.setHex(hex).multiplyScalar(k);
        rings.setColorAt(i, col);
        gems.setColorAt(i, col);
        // the ring turns while its route is being validated; the gem hovers
        tmp.position.set(cellX(i), 1.02, ROOM.z);
        tmp.rotation.set(Math.PI / 2, 0, r?.validating ? u.t * 2.4 : 0);
        tmp.scale.setScalar(r ? 1 : 0.85);
        tmp.updateMatrix();
        rings.setMatrixAt(i, tmp.matrix);
        tmp.position.set(cellX(i), 1.75 + Math.sin(u.t * 1.4 + i) * 0.05, ROOM.z);
        tmp.rotation.set(0, u.t * (r?.validating ? 3 : 0.6), 0);
        tmp.scale.set(r ? 0.2 : 0.09, r ? 0.3 : 0.14, r ? 0.2 : 0.09);
        tmp.updateMatrix();
        gems.setMatrixAt(i, tmp.matrix);
      }
      rings.instanceMatrix.needsUpdate = gems.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      if (gems.instanceColor) gems.instanceColor.needsUpdate = true;

      // the gantry sweeps while the validator works
      const sweep = busy ? Math.sin(u.t * 0.9) * (ROOM.w / 2 - 0.8) : scan.position.x * 0.96;
      scan.position.x += (sweep - scan.position.x) * Math.min(1, u.dt * 3);
      headMat.color.copy(u.color);
      beamMat.color.copy(u.color);
      beamMat.opacity = busy ? 0.4 : 0;

      // the main display: one row per route of the newest attempt, in the validator's own words
      sMain.level(dim);
      const failure = z?.activity === "failed" ? (z.error ?? "validation failed") : null;
      sMain.draw(`M|${failure}|${routes.map((r) => `${r.routeId}${r.assessment}${r.validating}${r.steps}`).join(",")}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "VALIDATION", failure ? "FAILED" : flagged ? "FLAGGED" : `${routes.length} route(s)`, failure || flagged ? "#b5533c" : INK.accent);
        if (failure) {
          text(g, "VALIDATION FAILED", 28, y + 6, 40, "#c9694f");
          paragraph(g, failure, 28, y + 64, W - 56, 22, INK.text, 5);
          return;
        }
        if (!routes.length) {
          text(g, u.s.awake ? "no routes to validate yet" : "no run selected", 28, y + 10, 26, INK.dim);
          return;
        }
        for (const r of routes.slice(0, 6)) {
          const c = r.assessment ? `#${ASSESSMENT_HEX[r.assessment].toString(16).padStart(6, "0")}` : r.validating ? "#d6a45b" : INK.dim;
          g.fillStyle = c;
          g.fillRect(28, y + 6, 12, 12);
          text(g, `ROUTE ${r.routeId}`, 54, y, 24, INK.text);
          text(g, `${r.steps ?? "?"} step(s)`, 230, y + 3, 19, INK.dim);
          text(g, r.assessment ? ASSESSMENT_WORD[r.assessment] : r.validating ? "VALIDATING…" : "awaiting validation", W - 28, y + 2, 21, c, "right");
          y += 40;
        }
      });

      const tools = z?.tools ?? [];
      sTools.level(dim);
      sTools.draw(`T|${tools.map((t) => t.name + t.status + t.ms).join(",")}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "VALIDATOR TOOLS", `${tools.length}`);
        if (!tools.length) text(g, u.s.awake ? "no tool calls" : "no run", 20, y + 6, 18, INK.dim);
        for (const t of tools.slice(-5)) {
          const c = t.status === "COMPLETED" ? INK.accent : t.status === "FAILED" || t.status === "DENIED" ? "#c9694f" : "#d6a45b";
          text(g, t.name, 20, y, 16, INK.text);
          text(g, t.status === "COMPLETED" ? `${t.ms ?? "—"} ms` : t.status, W - 20, y, 14, c, "right");
          y += 30;
        }
      });
    },
    dispose() {
      rings.dispose();
      gems.dispose();
      f.dispose();
      sMain.dispose();
      sTools.dispose();
    },
  };
}
