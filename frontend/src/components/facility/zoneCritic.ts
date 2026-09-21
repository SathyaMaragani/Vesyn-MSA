// CRITIC: a review amphitheatre. Tiered seating faces a stage where every candidate route of the newest
// attempt stands as a plate, with a column of the critic's real findings in front of it (copper = high
// severity, amber = medium, sage = low; counts come from CRITIQUE_CREATED). It is built to read as
// comparing and challenging, unlike the retrosynthesis hall, which reads as making.
import * as THREE from "three";
import { ASSESSMENT_HEX } from "./facilityState";
import { ZONES } from "./layout";
import { C } from "./kit";
import { INK, Screen, frame, paragraph, text } from "./screen";
import { makeFrame, withZone, type BuildEnv, type ZoneRig, type ZoneUpdate } from "./zoneKit";

const MAX_ROUTES = 8;
const SEV: [keyof { high: 0; medium: 0; low: 0 }, number][] = [["high", 0xb5533c], ["medium", 0xd6a45b], ["low", 0x8faf9a]];

export function buildCritic(env: BuildEnv): ZoneRig {
  const def = ZONES.critic;
  const f = makeFrame(env, def);
  const { d } = def;
  const wallZ = -d / 2 + 0.44;
  const CZ = 1.2; // centre of the arena

  withZone(env, def, () => {
    // three tiers of seating in an arc behind the stage
    [4.6, 5.5, 6.4].forEach((r, ti) => {
      const y = 0.55 + ti * 0.36;
      const segs = 14;
      for (let s = 0; s < segs; s++) {
        const a = Math.PI * (0.1 + (0.8 * (s + 0.5)) / segs);
        const len = (r * Math.PI * 0.8) / segs;
        const ry = Math.atan2(Math.cos(a), -Math.sin(a));
        const px = r * Math.cos(a);
        const pz = CZ - r * Math.sin(a);
        env.metal.box(len * 1.02, 0.36 + ti * 0.36, 0.86, px, y / 2 + 0.16, pz, C.metal, ry);
        env.matte.box(len * 0.84, 0.07, 0.42, px, y + 0.2, pz + Math.cos(a) * 0.0 + 0.0, 0x2b2c27, ry);
      }
    });
    // the stage: a low round dais and the comparison rig
    env.metal.cyl(3.6, 3.7, 0.3, 0, 0.47, CZ + 1.2, C.metal, 40);
    env.matte.cyl(3.4, 3.4, 0.04, 0, 0.64, CZ + 1.2, 0x15160f, 40);
    env.metal.box(8.4, 0.1, 0.16, 0, 3.35, CZ + 0.4, C.brushed); // the overhead truss the scanners ride
    for (const sx of [-1, 1]) env.metal.box(0.12, 3.0, 0.12, sx * 4.2, 1.9, CZ + 0.4, C.metal);
    env.metal.box(8.0, 0.16, 0.6, 0, 0.72, CZ + 0.4, C.brushed); // the plate rail
    // the lectern with the four verbs of the critic's work
    env.metal.box(8.2, 0.55, 0.5, 0, 0.6, CZ + 3.9, C.metal, 0);
  });
  f.acc.geo(new THREE.TorusGeometry(3.42, 0.05, 6, 72), 0, 0.68, CZ + 1.2, 0xffffff, 1, 0, Math.PI / 2);
  f.finish();

  // plates + finding columns (instanced)
  const plateGeo = env.track(new THREE.BoxGeometry(0.85, 1.35, 0.06));
  const plateMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const plates = new THREE.InstancedMesh(plateGeo, plateMat, MAX_ROUTES);
  plates.count = 0;
  plates.frustumCulled = false;
  const colGeo = env.track(new THREE.BoxGeometry(0.26, 1, 0.26));
  const colMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const columns = new THREE.InstancedMesh(colGeo, colMat, MAX_ROUTES * 3);
  columns.count = 0;
  columns.frustumCulled = false;
  f.group.add(plates, columns);

  // two scanning rings that ride the truss while the critic works
  const ringMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.9 }));
  const scanRings = [0, 1].map(() => {
    const m = new THREE.Mesh(env.track(new THREE.TorusGeometry(0.75, 0.025, 6, 40)), ringMat);
    m.position.set(0, 2.0, CZ + 0.9);
    f.group.add(m);
    return m;
  });

  const sMain = env.track(new Screen(6.6, 2.4, 640));
  sMain.mesh.position.set(0, 3.5, wallZ);
  f.group.add(sMain.mesh);
  const sVerbs = env.track(new Screen(7.8, 0.5, 780));
  sVerbs.mesh.position.set(0, 1.02, CZ + 3.66);
  sVerbs.mesh.rotation.x = -0.22;
  f.group.add(sVerbs.mesh);

  const tmp = new THREE.Object3D();
  const col = new THREE.Color();
  let key = "";
  const anchor = new THREE.Vector3(def.x, 6.6, def.z);

  return {
    id: "critic",
    group: f.group,
    hit: [f.hit],
    anchor,
    update(u: ZoneUpdate) {
      f.update(u);
      const z = u.z;
      const busy = !!z?.busy;
      const routes = u.s.current.slice(0, MAX_ROUTES);
      const dim = 0.3 + 0.7 * Math.max(u.glow, 0.25);

      const k = routes.map((r) => `${r.routeId}${r.assessment}${JSON.stringify(r.critique?.counts ?? null)}`).join("|");
      if (k !== key) {
        key = k;
        const n = routes.length;
        plates.count = n;
        let ci = 0;
        routes.forEach((r, i) => {
          const x = (i - (n - 1) / 2) * 1.02;
          tmp.position.set(x, 1.6, CZ + 0.4);
          tmp.rotation.set(0, 0, 0);
          tmp.scale.set(1, 1, 1);
          tmp.updateMatrix();
          plates.setMatrixAt(i, tmp.matrix);
          plates.setColorAt(i, col.setHex(r.assessment ? ASSESSMENT_HEX[r.assessment] : 0x55564d).multiplyScalar(r.assessment ? 0.75 : 0.5));
          // the critic's findings for this route, stacked in front of it
          const counts = r.critique?.counts ?? {};
          let y0 = 0.68;
          SEV.forEach(([sev, hex], j) => {
            const c = counts[sev] ?? 0;
            const h = r.critique ? Math.max(c * 0.3, c > 0 ? 0.12 : 0.03) : 0.03;
            tmp.position.set(x, y0 + h / 2, CZ + 1.3);
            tmp.scale.set(1, h, 1);
            tmp.updateMatrix();
            columns.setMatrixAt(ci, tmp.matrix);
            columns.setColorAt(ci, col.setHex(r.critique && c > 0 ? hex : 0x33342d));
            ci++;
            y0 += h + 0.015;
            void j;
          });
        });
        columns.count = ci;
        plates.instanceMatrix.needsUpdate = columns.instanceMatrix.needsUpdate = true;
        if (plates.instanceColor) plates.instanceColor.needsUpdate = true;
        if (columns.instanceColor) columns.instanceColor.needsUpdate = true;
      }

      ringMat.color.copy(u.color);
      scanRings.forEach((m, i) => {
        m.visible = busy;
        m.position.x = Math.sin(u.t * 0.8 + i * 2.2) * 3.4;
        m.rotation.y = u.t * 1.4 + i;
        m.rotation.x = Math.PI / 2 * 0 + Math.sin(u.t + i) * 0.3;
      });

      // main display: the critic's headline for the latest critiqued route
      const critiqued = [...routes].reverse().find((r) => r.critique) ?? null;
      const failure = z?.activity === "failed" ? (z.error ?? "critique failed") : null;
      sMain.level(dim);
      sMain.draw(`M|${failure}|${routes.map((r) => `${r.routeId}${JSON.stringify(r.critique)}`).join("|")}|${u.s.awake}`, (g, W, H) => {
        let y = frame(g, W, H, "CRITIQUE", failure ? "FAILED" : critiqued ? `route ${critiqued.routeId}` : u.s.awake ? "awaiting" : "no run", failure ? "#b5533c" : "#d6a45b");
        if (failure) return void paragraph(g, failure, 28, y + 8, W - 56, 22, INK.text, 5);
        if (!critiqued?.critique) {
          text(g, u.s.awake ? "no critique yet" : "no run selected", 28, y + 10, 26, INK.dim);
          return;
        }
        y = paragraph(g, critiqued.critique.headline, 28, y + 6, W - 56, 24, INK.text, 2);
        const c = critiqued.critique.counts;
        SEV.forEach(([sev, hex], i) => {
          g.fillStyle = `#${hex.toString(16).padStart(6, "0")}`;
          g.fillRect(28 + i * 200, y + 14, 14, 14);
          text(g, `${sev.toUpperCase()} ${c[sev] ?? 0}`, 50 + i * 200, y + 10, 21, INK.text);
        });
      });
      sVerbs.level(busy ? 1 : 0.4 + 0.3 * dim);
      sVerbs.draw(`V|${busy}`, (g, W, H) => {
        g.font = `600 ${Math.round(H * 0.5)}px ui-monospace, Consolas, monospace`;
        g.textBaseline = "middle";
        g.textAlign = "center";
        g.fillStyle = busy ? "#d6a45b" : INK.dim;
        g.fillText("COMPARE   ·   QUESTION   ·   CHALLENGE   ·   IDENTIFY ISSUES", W / 2, H / 2);
      });
    },
    dispose() {
      plates.dispose();
      columns.dispose();
      f.dispose();
      sMain.dispose();
      sVerbs.dispose();
    },
  };
}
