// THE REST OF THE FACILITY: everything that is not a department but makes the building a building.
//
// Four support buildings fill the corners of the plan (compute hall, sample archive, instrument bay,
// analytical bay), each with its own silhouette and materials; an upper level (a glazed mezzanine walkway
// around three sides); suspended lighting; the entrance hall; and, beyond the glass, the
// rest of the campus in the fog. None of it is data. It is architecture and ambient equipment: the only
// things that move here are slow, quiet, environmental (rack indicators, a fan, a rotating instrument
// ring). Agent and task activity lives only in the departments and is driven by the backend.
import * as THREE from "three";
import { C } from "./kit";
import { INK, Screen, FONT } from "./screen";
import type { BuildEnv } from "./zoneKit";
import { railing } from "./zoneKit";

export const MEZZ_Y = 6.3;

export interface Precinct {
  group: THREE.Group;
  update: (t: number, dt: number, power: number) => void;
  dispose: () => void;
}

// small deterministic random, so the building is the same every time it loads
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildPrecinct(env: BuildEnv): Precinct {
  const group = new THREE.Group();
  const rnd = rng(11);
  const signs: Screen[] = [];
  const sign = (text: string, sub: string, w: number, x: number, y: number, z: number, ry: number) => {
    const s = env.track(new Screen(w, w * 0.22, 512));
    s.draw(`${text}|${sub}`, (g, W, H) => {
      g.fillStyle = INK.bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#55806a";
      g.fillRect(0, 0, 6, H);
      g.textBaseline = "top";
      g.font = `${Math.round(H * 0.2)}px ${FONT}`;
      g.fillStyle = INK.dim;
      g.fillText(sub, 22, H * 0.14);
      g.font = `700 ${Math.round(H * 0.4)}px ${FONT}`;
      g.fillStyle = INK.text;
      g.fillText(text, 22, H * 0.44);
    });
    s.level(0.78);
    s.mesh.position.set(x, y, z);
    s.mesh.rotation.y = ry;
    group.add(s.mesh);
    signs.push(s);
  };

  // ---- indicator lights: one instanced mesh, slow and quiet -------------------------------------------------
  const leds: { x: number; y: number; z: number; ry: number; hue: number; phase: number; rate: number }[] = [];
  const led = (x: number, y: number, z: number, ry = 0, hue = 0) => leds.push({ x, y, z, ry, hue, phase: rnd() * 6.28, rate: 0.25 + rnd() * 0.9 });

  // ---- 1. COMPUTE HALL (north-west): rows of racks under a glass roof ---------------------------------------
  {
    const x0 = -44;
    const x1 = -17;
    const z0 = -36.5;
    const z1 = -15;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    env.metal.box(x1 - x0 + 0.8, 0.3, z1 - z0 + 0.8, cx, 0.15, cz, C.metal);
    env.matte.box(x1 - x0, 0.05, z1 - z0, cx, 0.32, cz, 0x1b1d1a);
    // hot / cold aisle floor stripes
    for (let r = 0; r < 5; r++) {
      const z = z0 + 4 + r * 4.4;
      env.emit.box(x1 - x0 - 3, 0.02, 0.06, cx, 0.36, z + 1.25, 0x2b3a32);
      for (let i = 0; i < 9; i++) {
        const x = x0 + 3.2 + i * 2.85;
        env.metal.box(1.1, 3.4, 0.95, x, 2.02, z, i % 4 === 3 ? C.brushed : C.metal);
        env.matte.box(0.96, 3.2, 0.05, x, 2.02, z + 0.49, 0x0e0f0d);
        for (let k = 0; k < 5; k++) led(x - 0.36 + (k % 3) * 0.36, 1.0 + Math.floor(k / 3) * 1.4 + rnd() * 0.5, z + 0.53, 0, rnd() < 0.86 ? 0 : 1);
        for (let k = 1; k < 8; k++) env.metal.box(1.0, 0.03, 0.05, x, 0.32 + (3.4 * k) / 8, z + 0.5, C.brushed);
      }
      // overhead cable tray above the row
      env.metal.box(x1 - x0 - 3, 0.12, 0.6, cx, 4.3, z - 0.2, C.brushed);
    }
    // glass roof on a steel frame, glass end walls, a service door
    for (let x = x0; x <= x1 + 0.1; x += 4.5) env.metal.box(0.16, 0.24, z1 - z0, x, 4.9, cz, C.metal);
    for (let z = z0; z <= z1 + 0.1; z += 5.4) env.metal.box(x1 - x0, 0.16, 0.16, cx, 4.95, z, C.brushed);
    env.glass.box(x1 - x0, 0.06, z1 - z0, cx, 5.05, cz, C.glass);
    env.glass.box(x1 - x0, 4.6, 0.06, cx, 2.6, z1, C.glass);
    env.glass.box(0.06, 4.6, z1 - z0, x1, 2.6, cz, C.glass);
    for (let x = x0; x <= x1 + 0.1; x += 4.5) env.metal.box(0.14, 4.7, 0.14, x, 2.65, z1, C.metal);
    for (let z = z0; z <= z1 + 0.1; z += 5.4) env.metal.box(0.14, 4.7, 0.14, x1, 2.65, z, C.metal);
    // warm working light under the roof
    for (let r = 0; r < 4; r++) env.emit.box(x1 - x0 - 6, 0.05, 0.3, cx, 4.7, z0 + 6.2 + r * 4.4, 0x8f8672);
    sign("COMPUTE", "INFRASTRUCTURE", 5.6, x1 - 3.5, 5.8, z1 + 0.15, 0);
  }

  // ---- 2. SAMPLE ARCHIVE (north-east): tall cold storage with frosted doors, a central island ----------------
  {
    const x0 = 17;
    const x1 = 44;
    const z0 = -36.5;
    const z1 = -15;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    env.metal.box(x1 - x0 + 0.8, 0.3, z1 - z0 + 0.8, cx, 0.15, cz, C.metal);
    env.matte.box(x1 - x0, 0.05, z1 - z0, cx, 0.32, cz, 0x2b2a25);
    // two long walls of cabinets with frosted glass doors and a warm interior
    for (const zz of [z0 + 1.6, z1 - 1.6]) {
      for (let i = 0; i < 12; i++) {
        const x = x0 + 1.8 + i * 2.15;
        env.metal.box(2.0, 4.2, 1.0, x, 2.4, zz, C.metal);
        env.glass.box(1.8, 3.9, 0.04, x, 2.4, zz + (zz < cz ? 0.52 : -0.52), C.glass);
        env.emit.box(1.5, 3.4, 0.03, x, 2.4, zz + (zz < cz ? 0.48 : -0.48), 0x5a4a34);
        env.metal.box(0.04, 0.5, 0.05, x + 0.75, 2.4, zz + (zz < cz ? 0.58 : -0.58), C.steel);
        led(x - 0.7, 4.3, zz + (zz < cz ? 0.55 : -0.55), 0, 0);
      }
    }
    // the sample island: a long steel table with trays, and a suspended transfer rail above it
    env.metal.box(14, 0.08, 2.4, cx, 1.0, cz, C.steel);
    env.matte.box(13.8, 0.62, 2.2, cx, 0.66, cz, C.graphite);
    for (let i = 0; i < 18; i++) {
      env.matte.box(0.6, 0.05, 0.9, cx - 6.4 + i * 0.75, 1.07, cz + (i % 2 ? 0.4 : -0.4), 0x171814);
      for (let k = 0; k < 4; k++) env.glass.cyl(0.09, 0.09, 0.22, cx - 6.6 + i * 0.75 + (k % 2) * 0.28, 1.2, cz + (i % 2 ? 0.4 : -0.4) + (k > 1 ? 0.24 : -0.24), C.glass, 8);
    }
    env.metal.box(x1 - x0 - 4, 0.14, 0.24, cx, 5.3, cz, C.brushed);
    env.metal.box(0.7, 0.6, 0.5, cx + 3, 5.0, cz, C.metal);
    env.metal.box(0.04, 1.6, 0.04, cx + 3, 4.1, cz, C.steel);
    for (const x of [x0, x1]) env.metal.box(0.2, 5.3, 0.2, x, 2.65, cz, C.metal);
    // frosted roof and glazed inner walls
    for (let x = x0; x <= x1 + 0.1; x += 4.5) env.metal.box(0.16, 0.24, z1 - z0, x, 5.5, cz, C.metal);
    env.glass.box(x1 - x0, 0.06, z1 - z0, cx, 5.6, cz, C.glass);
    env.glass.box(0.06, 5.2, z1 - z0, x0, 2.9, cz, C.glass);
    env.glass.box(x1 - x0, 5.2, 0.06, cx, 2.9, z1, C.glass);
    for (let z = z0; z <= z1 + 0.1; z += 5.4) env.metal.box(0.14, 5.3, 0.14, x0, 2.95, z, C.metal);
    for (let x = x0; x <= x1 + 0.1; x += 4.5) env.metal.box(0.14, 5.3, 0.14, x, 2.95, z1, C.metal);
    for (let r = 0; r < 3; r++) env.emit.box(x1 - x0 - 6, 0.05, 0.3, cx, 5.2, z0 + 5 + r * 5.2, 0x9a8460);
    sign("SAMPLE ARCHIVE", "CONTROLLED STORAGE", 6.8, x0 + 4.4, 6.3, z1 + 0.15, 0);
  }

  // ---- 3. INSTRUMENT BAY (south-west): three big analytical instruments on isolation plinths -----------------
  const rings: THREE.Object3D[] = [];
  {
    const x0 = -44;
    const x1 = -34;
    const z0 = 10;
    const z1 = 44;
    const cx = (x0 + x1) / 2;
    env.metal.box(x1 - x0 + 0.8, 0.3, z1 - z0 + 0.8, cx, 0.15, (z0 + z1) / 2, C.metal);
    env.matte.box(x1 - x0, 0.05, z1 - z0, cx, 0.32, (z0 + z1) / 2, 0x252520);
    for (let i = 0; i < 3; i++) {
      const z = z0 + 6 + i * 11;
      env.metal.box(5, 0.5, 5, cx, 0.62, z, C.brushed);
      env.matte.box(4.4, 0.08, 4.4, cx, 0.9, z, 0x14150f);
      env.metal.cyl(1.5, 1.5, 3.3, cx, 2.6, z, C.metal, 28);
      env.metal.cyl(1.72, 1.72, 0.22, cx, 1.2, z, C.brushed, 28);
      env.metal.cyl(1.72, 1.72, 0.22, cx, 4.2, z, C.brushed, 28);
      env.metal.cyl(0.5, 0.9, 1.2, cx, 5.0, z, C.metal, 20);
      env.metal.cyl(0.18, 0.18, 1.6, cx, 6.2, z, C.steel, 10);
      env.metal.box(1.6, 1.0, 1.0, cx + 2.9, 1.3, z, C.metal);
      env.matte.box(1.4, 0.06, 0.8, cx + 2.9, 1.83, z, 0x20211c);
      led(cx + 2.9, 1.5, z + 0.52, 0, 0);
      led(cx + 3.15, 1.5, z + 0.52, 0, 0);
      // low glass partition around the instrument
      env.glass.box(0.05, 1.8, 6.6, x0 + 0.3, 1.2, z, C.glass);
      env.metal.box(0.08, 0.08, 6.6, x0 + 0.3, 2.12, z, C.brushed);
      // an indicator ring that turns slowly (ambient)
      const ring = new THREE.Mesh(env.track(new THREE.TorusGeometry(1.95, 0.025, 6, 48)), env.track(new THREE.MeshBasicMaterial({ color: 0x7f9d8a, toneMapped: false, transparent: true, opacity: 0.55 })));
      ring.position.set(cx, 3.2, z);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      rings.push(ring);
    }
    sign("INSTRUMENT BAY", "SPECTROSCOPY", 5.6, cx, 7.4, z0 + 0.4, Math.PI);
    signs[signs.length - 1].mesh.rotation.y = 0;
    signs[signs.length - 1].mesh.position.set(cx + 4.8, 3.3, z0 + 22);
    signs[signs.length - 1].mesh.rotation.y = Math.PI / 2;
  }

  // ---- 4. ANALYTICAL BAY (south-east): fume hoods, chromatography benches ---------------------------------------
  const fans: THREE.Object3D[] = [];
  {
    const x0 = 34;
    const x1 = 44;
    const z0 = 10;
    const z1 = 44;
    const cx = (x0 + x1) / 2;
    env.metal.box(x1 - x0 + 0.8, 0.3, z1 - z0 + 0.8, cx, 0.15, (z0 + z1) / 2, C.metal);
    env.matte.box(x1 - x0, 0.05, z1 - z0, cx, 0.32, (z0 + z1) / 2, 0x33322b);
    for (let i = 0; i < 6; i++) {
      const z = z0 + 3.5 + i * 5.5;
      // a fume hood on the east wall: metal shell, glass sash, a lit interior, an extract duct up
      env.metal.box(1.6, 3.2, 3.6, x1 - 1.2, 1.9, z, C.metal);
      env.glass.box(0.05, 1.7, 3.2, x1 - 2.05, 2.0, z, C.glass);
      env.emit.box(0.04, 1.5, 3.0, x1 - 1.6, 2.0, z, 0x4b5a4f);
      env.metal.cyl(0.32, 0.32, 3.4, x1 - 1.2, 5.2, z, C.brushed, 12);
      // a bench with an instrument on it, facing the hood
      env.metal.box(3.4, 0.08, 1.1, cx - 1.2, 1.0, z, C.steel);
      env.matte.box(3.3, 0.66, 1.0, cx - 1.2, 0.65, z, C.graphite);
      env.metal.box(0.9, 0.55, 0.6, cx - 2.2, 1.34, z, C.metal);
      env.metal.box(1.1, 0.4, 0.7, cx - 0.5, 1.28, z, C.brushed);
      env.metal.cyl(0.05, 0.05, 0.6, cx - 0.5, 1.7, z, C.steel, 8);
      for (let k = 0; k < 3; k++) env.glass.cyl(0.07, 0.07, 0.3, cx + 0.6 + k * 0.26, 1.18, z + 0.2, C.glass, 8);
      led(cx - 2.2, 1.5, z + 0.32, 0, 0);
    }
    env.glass.box(0.05, 3.2, z1 - z0, x0 + 0.4, 2.0, (z0 + z1) / 2, C.glass);
    // extract fan on the roof duct (turns slowly)
    const fan = new THREE.Mesh(env.track(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 6)), env.track(new THREE.MeshStandardMaterial({ color: C.brushed, metalness: 0.8, roughness: 0.4 })));
    fan.position.set(x1 - 1.2, 7.1, z0 + 14);
    group.add(fan);
    fans.push(fan);
    sign("ANALYTICAL BAY", "CHROMATOGRAPHY", 5.6, x0 + 0.5, 3.6, z0 + 26, -Math.PI / 2);
  }

  // ---- 5. the entrance hall (south): a nave of columns and low benches between the portal and the critic ----
  {
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = 35 + i * 4;
        env.metal.cyl(0.3, 0.34, 8.6, sx * 16, 4.3, z, C.metal, 16);
        env.metal.cyl(0.46, 0.46, 0.14, sx * 16, 0.07, z, C.brushed, 16);
        env.metal.box(32.4, 0.3, 0.3, 0, 8.6, z, C.brushed);
      }
      env.matte.box(4.4, 0.7, 0.9, sx * 11, 0.35, 41, 0x201f1b);
      env.metal.box(4.6, 0.06, 1.0, sx * 11, 0.72, 41, C.steel);
      // threshold light: a lit strip either side of the way in
      env.emit.box(0.1, 0.02, 12, sx * 5.2, 0.05, 44, 0x6a6a5c);
    }
    for (let i = 0; i < 4; i++) env.emit.box(24, 0.05, 0.28, 0, 8.4, 35 + i * 4, 0x8f8672);
  }

  // ---- the upper level: a glazed mezzanine walkway around the east, west and north walls ------------------------
  {
    const deck = (x: number, z: number, w: number, d: number) => {
      env.metal.box(w, 0.32, d, x, MEZZ_Y - 0.16, z, C.metal);
      env.matte.box(w - 0.1, 0.03, d - 0.1, x, MEZZ_Y + 0.02, z, 0x24251f);
    };
    for (const sx of [-1, 1]) {
      deck(sx * 47.2, 3, 5, 91);
      // inner edge: balustrade and a warm under-lighting strip
      railing(env, sx * 44.7, -42, sx * 44.7, 49, MEZZ_Y, 1.05, true);
      env.emit.box(0.08, 0.05, 91, sx * 44.75, MEZZ_Y - 0.36, 3, 0x6b6250);
      for (let z = -40; z <= 48; z += 9) {
        env.metal.cyl(0.24, 0.3, MEZZ_Y - 0.3, sx * 44.7, (MEZZ_Y - 0.3) / 2, z, C.metal, 12);
        env.emit.box(1.4, 0.05, 0.3, sx * 47.2, MEZZ_Y + 3.2, z, 0x8f8672);
      }
      // stair down at the south end
      for (let i = 0; i < 14; i++) env.metal.box(1.6, 0.12, 0.34, sx * 47.2, MEZZ_Y - 0.08 - i * (MEZZ_Y / 14), 46.6 - i * 0.34 + 0, C.steel);
    }
    deck(0, -39.4, 90, 4.6);
    railing(env, -44.7, -37.1, 44.7, -37.1, MEZZ_Y, 1.05, true);
    env.emit.box(89, 0.05, 0.08, 0, MEZZ_Y - 0.36, -37.1, 0x6b6250);
    for (let x = -40; x <= 40; x += 8) env.metal.cyl(0.24, 0.3, MEZZ_Y - 0.3, x, (MEZZ_Y - 0.3) / 2, -37.1, C.metal, 12);
  }

  // ---- ceiling: suspended light bars on hairline wires (no beams: the camera looks down into the building) ----------
  {
    for (const x of [-30, -10, 10, 30]) {
      for (const z of [-20, 0, 20, 38]) {
        env.emit.box(0.34, 0.05, 6.4, x, 11.6, z, 0x8a8168);
        for (const dz of [-2.8, 2.8]) env.metal.box(0.02, 2.6, 0.02, x, 13.0, z + dz, C.steel);
      }
    }
  }

  // ---- beyond the glass: ground and distant halls ---------------------------------------------------------------------
  {
    env.matte.box(700, 0.2, 700, 0, -0.16, 0, 0x121310);
    const hall = (cx: number, cz: number, w: number, d: number, h: number) => {
      env.matte.box(w, h, d, cx, h / 2, cz, 0x1c1d19);
      env.metal.box(w + 0.6, 0.5, d + 0.6, cx, h + 0.25, cz, C.metal);
      const rows = Math.max(1, Math.floor(h / 4.5));
      for (let r = 0; r < rows; r++) {
        if (rnd() < 0.2) continue;
        env.emit.box(w * 0.86, 0.6, 0.06, cx, 2.6 + r * 4.4, cz + d / 2 + 0.05, rnd() < 0.6 ? 0x4f4a3c : 0x3d5247);
      }
    };
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const z = -70 + i * 24 + rnd() * 6;
        const x = sx * (70 + rnd() * 50);
        hall(x, z, 16 + rnd() * 14, 14 + rnd() * 10, 8 + rnd() * 26);
      }
    }
    for (let i = 0; i < 8; i++) hall(-90 + i * 26 + rnd() * 8, -78 - rnd() * 40, 18 + rnd() * 12, 14 + rnd() * 10, 10 + rnd() * 24);
    // a tall exhaust stack and a pair of storage tanks
    env.metal.cyl(1.4, 2.0, 46, -62, 23, -58, 0x2a2b26, 14);
    env.emit.box(2.6, 0.5, 0.06, -62, 43, -55.9, 0x8a5a44);
    for (const dx of [0, 9]) env.metal.cyl(4, 4, 9, 66 + dx, 4.5, -44, 0x272823, 20);
  }

  // ---- ambient indicator lights (one instanced mesh) ---------------------------------------------------------------------
  const ledGeo = env.track(new THREE.BoxGeometry(0.11, 0.05, 0.03));
  const ledMat = env.track(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const ledMesh = new THREE.InstancedMesh(ledGeo, ledMat, Math.max(leds.length, 1));
  ledMesh.frustumCulled = false;
  {
    const o = new THREE.Object3D();
    leds.forEach((l, i) => {
      o.position.set(l.x, l.y, l.z);
      o.rotation.set(0, l.ry, 0);
      o.updateMatrix();
      ledMesh.setMatrixAt(i, o.matrix);
      ledMesh.setColorAt(i, new THREE.Color(0x4b6b5c));
    });
  }
  group.add(ledMesh);

  const c = new THREE.Color();
  const green = new THREE.Color(0x5f8a72);
  const amber = new THREE.Color(0xc99a52);
  let frame = 0;
  return {
    group,
    update(t, dt, power) {
      frame++;
      rings.forEach((r, i) => (r.rotation.z += dt * (0.12 + i * 0.05)));
      fans.forEach((f) => (f.rotation.y += dt * 1.6));
      if (frame % 4 === 0) {
        leds.forEach((l, i) => {
          const b = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * l.rate + l.phase), 3);
          c.copy(l.hue ? amber : green).multiplyScalar(b * (0.2 + 0.8 * power));
          ledMesh.setColorAt(i, c);
        });
        if (ledMesh.instanceColor) ledMesh.instanceColor.needsUpdate = true;
      }
      signs.forEach((s) => s.level(0.55 + 0.35 * power));
    },
    dispose() {
      ledMesh.dispose();
      signs.forEach((s) => s.dispose());
    },
  };
}
