// What every department is made of, and the interface the world uses to drive it.
import * as THREE from "three";
import type { KnownAgentId } from "../../types/agents.ts";
import { TONE_LOOK, type FacilityState, type ZoneState } from "./facilityState.ts";
import { ZONES, type ZoneDef, yawOf } from "./layout";
import { Batch, C, shaftTexture, type Mats } from "./kit";
import { INK, Screen, FONT, hexCss } from "./screen";

/** Shared build context: the static batches every department adds its architecture and equipment to. */
export interface BuildEnv {
  mats: Mats;
  metal: Batch;
  matte: Batch;
  glass: Batch;
  emit: Batch;
  glow: THREE.Texture;
  track: <T extends { dispose: () => void }>(o: T) => T;
}

/** What the world hands each department every frame. All of it is eased, derived state. */
export interface ZoneUpdate {
  s: FacilityState;
  z: ZoneState | null;
  /** eased tone colour of the department */
  color: THREE.Color;
  /** 0..1 eased presence (inactive areas recede); already includes the pulse */
  glow: number;
  /** 0..1 flash from a live event in this department (decays) */
  flash: number;
  hover: number;
  selected: boolean;
  t: number;
  dt: number;
}

export interface ZoneRig {
  id: KnownAgentId | "core";
  group: THREE.Group;
  /** invisible pick volumes */
  hit: THREE.Object3D[];
  /** world position a label may hang from */
  anchor: THREE.Vector3;
  update: (u: ZoneUpdate) => void;
  dispose: () => void;
}

/** The placement matrix of a department (its centre on its floor, turned to face the core). */
export function zoneMatrix(def: ZoneDef): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(def.x, def.floor, def.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawOf(def)), new THREE.Vector3(1, 1, 1));
}

/** Run `fn` with every static batch placed in the department's own frame. */
export function withZone<T>(env: BuildEnv, def: ZoneDef, fn: () => T): T {
  const m = zoneMatrix(def);
  for (const b of [env.metal, env.matte, env.glass, env.emit]) b.push(m);
  try {
    return fn();
  } finally {
    for (const b of [env.metal, env.matte, env.glass, env.emit]) b.pop();
  }
}

/** Each department's floor is its own material: ceramic, slate, warm stone... (all inside the palette). */
const FLOOR_OF: Partial<Record<string, number>> = {
  research: 0x2c332d, // slate with a green cast
  retro: 0x2d2926, // warm dark stone
  validator: 0x67665d, // pale ceramic: a clean room
  critic: 0x2a2b2b, // graphite
  replanner: 0x2f2825, // oxidised copper-graphite
  evaluator: 0x4b493f, // warm ivory stone
};
const FLOOR_INSET: Partial<Record<string, number>> = {
  research: 0x333c35,
  retro: 0x363029,
  validator: 0x77766b,
  critic: 0x303131,
  replanner: 0x3a3029,
  evaluator: 0x575447,
};

export interface Frame {
  group: THREE.Group;
  /** state-coloured parts (accent strips, lamps, monitor faces) */
  acc: Batch;
  /** finish: build the accent mesh (after the department added its own accent parts) */
  finish: () => void;
  sign: Screen;
  pool: THREE.Mesh;
  poolMat: THREE.MeshBasicMaterial;
  accMat: THREE.MeshBasicMaterial;
  hit: THREE.Mesh;
  update: (u: ZoneUpdate) => void;
  dispose: () => void;
}

/**
 * The common shell of a department: raised plinth, glass side partitions, a solid back wall with its
 * signage, the state-coloured edge strips and the light pool on the floor. Local frame: +z is the open
 * side (toward the core), the department is centred on the origin.
 */
export function makeFrame(env: BuildEnv, def: ZoneDef, opts: { wallH?: number; glassLen?: number } = {}): Frame {
  const { w, d } = def;
  const group = new THREE.Group();
  group.position.set(def.x, def.floor, def.z);
  group.rotation.y = yawOf(def);
  const wallH = opts.wallH ?? 5.4;
  const acc = new Batch();

  // the static shell is built in the department's own frame (the accent parts below live in `group`, which is already placed)
  const placement = zoneMatrix(def);
  for (const b of [env.metal, env.matte, env.glass, env.emit]) b.push(placement);

  // plinth and inset floor
  env.metal.box(w + 0.9, 0.3, d + 0.9, 0, 0.15, 0, C.metal);
  env.matte.box(w, 0.04, d, 0, 0.32, 0, FLOOR_OF[def.id] ?? 0x22231f);
  // an inlaid border in the department's own floor, so each reads as its own room
  env.matte.box(w - 1.2, 0.02, d - 1.2, 0, 0.345, 0, FLOOR_INSET[def.id] ?? 0x282923);
  // back wall: solid graphite panel with a metal cap and mullions
  env.matte.box(w, wallH, 0.35, 0, wallH / 2 + 0.3, -d / 2 + 0.2, C.panel);
  env.metal.box(w + 0.2, 0.18, 0.5, 0, wallH + 0.4, -d / 2 + 0.2, C.brushed);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 4) env.metal.box(0.16, wallH, 0.42, x, wallH / 2 + 0.3, -d / 2 + 0.2, C.metal);
  // glass partitions on both sides, open at the front
  const gl = opts.glassLen ?? d - 3.5;
  for (const sx of [-1, 1]) {
    env.glass.box(0.05, 3.7, gl, sx * (w / 2), 2.15, -d / 2 + 0.4 + gl / 2, C.glass);
    env.metal.box(0.14, 0.14, gl, sx * (w / 2), 4.02, -d / 2 + 0.4 + gl / 2, C.brushed);
    env.metal.box(0.14, 0.14, gl, sx * (w / 2), 0.37, -d / 2 + 0.4 + gl / 2, C.brushed);
    for (let z = -d / 2 + 0.4; z <= -d / 2 + 0.4 + gl + 0.01; z += 4) env.metal.box(0.14, 3.7, 0.14, sx * (w / 2), 2.15, z, C.metal);
  }
  // state-coloured strips: the front edge and both sides of the plinth, plus the sign's underline
  acc.box(w + 0.9, 0.06, 0.1, 0, 0.33, d / 2 + 0.42, 0xffffff);
  acc.box(0.1, 0.06, d + 0.9, -w / 2 - 0.42, 0.33, 0, 0xffffff);
  acc.box(0.1, 0.06, d + 0.9, w / 2 + 0.42, 0.33, 0, 0xffffff);
  acc.box(6.4, 0.06, 0.06, 0, wallH - 0.9, -d / 2 + 0.42, 0xffffff);
  // overhead: two light bars on hanger rods (static warm light) - the working light of the department
  for (const sx of [-0.28, 0.28]) {
    env.emit.box(w * 0.5, 0.08, 0.34, w * sx, 6.5, 0, 0x8f8672);
    for (const dx of [-1, 1]) env.metal.box(0.04, 1.4, 0.04, w * sx + dx * w * 0.2, 7.2, 0, C.metal);
  }

  for (const b of [env.metal, env.matte, env.glass, env.emit]) b.pop();

  const accMat = env.track(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));

  // signage
  const sign = env.track(new Screen(6.4, 1.5, 640));
  sign.mesh.position.set(0, wallH - 0.15, -d / 2 + 0.42);
  group.add(sign.mesh);

  // the light pool on the floor
  const poolMat = env.track(new THREE.MeshBasicMaterial({ map: env.glow, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const pool = new THREE.Mesh(env.track(new THREE.PlaneGeometry(w + 7, d + 7)), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.36;
  pool.renderOrder = 1;
  group.add(pool);

  // a soft column of light over the department while it is working, warning or failed: what draws the eye
  // to it from across the building (inactive departments have none and recede)
  const shaftMat = env.track(new THREE.MeshBasicMaterial({ map: env.track(shaftTexture()), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  const shaftGeo = env.track(new THREE.PlaneGeometry(1, 1));
  const shafts = [0, Math.PI / 2].map((ry) => {
    const m = new THREE.Mesh(shaftGeo, shaftMat);
    m.scale.set(Math.min(w, d) * 0.9, 10, 1);
    m.position.set(0, 5.4, 0);
    m.rotation.y = ry;
    m.renderOrder = 4;
    group.add(m);
    return m;
  });

  const hit = new THREE.Mesh(env.track(new THREE.BoxGeometry(w, 7.5, d)), env.track(new THREE.MeshBasicMaterial({ visible: false })));
  hit.position.y = 3.75;
  hit.userData = { zone: def.id };
  group.add(hit);

  let accMesh: THREE.Mesh | null = null;
  const finish = () => {
    accMesh = acc.build(accMat, false);
    if (accMesh) group.add(accMesh);
  };

  let shaftLevel = 0;
  const update = (u: ZoneUpdate) => {
    const z0 = u.z;
    const lift = 0.32 + 0.68 * u.glow + u.hover * 0.25 + u.flash * 0.6;
    accMat.color.copy(u.color).multiplyScalar(lift);
    poolMat.color.copy(u.color);
    // only the states that mean "look here": processing / active / warning / failed (not idle, dormant or complete)
    const attention = z0 && (z0.tone === "active" || z0.tone === "processing" || z0.tone === "warning" || z0.tone === "failed") ? 1 : 0;
    shaftLevel += (attention * (z0?.tone === "failed" ? 0.5 : 1) - shaftLevel) * Math.min(1, u.dt * 2.2);
    shaftMat.color.copy(u.color);
    shaftMat.opacity = 0.16 * shaftLevel * (0.85 + 0.15 * Math.sin(u.t * 1.6)) + u.flash * 0.1;
    shafts.forEach((m) => (m.visible = shaftMat.opacity > 0.004));
    poolMat.opacity = Math.min(0.5, 0.07 + 0.17 * u.glow + u.hover * 0.06 + u.flash * 0.2 + (u.selected ? 0.07 : 0));
    sign.level(0.45 + 0.55 * Math.min(1, u.glow + u.hover * 0.3));
    const z = u.z;
    const label = z ? `${z.activity.toUpperCase()}` : "UNKNOWN";
    const key = `${def.id}|${z?.name}|${label}|${z?.tone}`;
    const toneHex = hexCss(TONE_LOOK[z?.tone ?? "dormant"].hex);
    sign.draw(key, (g, W, H) => {
      g.fillStyle = INK.bg;
      g.fillRect(0, 0, W, H);
      g.fillStyle = toneHex;
      g.fillRect(0, 0, 8, H);
      g.textBaseline = "top";
      g.textAlign = "left";
      g.font = `${Math.round(H * 0.16)}px ${FONT}`;
      g.fillStyle = INK.dim;
      g.fillText(`${def.number} · ${def.discipline}`, 28, H * 0.1);
      g.font = `700 ${Math.round(H * 0.34)}px ${FONT}`;
      g.fillStyle = INK.text;
      g.fillText(def.title, 28, H * 0.32);
      g.font = `${Math.round(H * 0.15)}px ${FONT}`;
      g.fillStyle = toneHex;
      g.fillText(label, 28, H * 0.76);
      if (z) {
        g.textAlign = "right";
        g.fillStyle = INK.dim;
        g.fillText(z.name, W - 20, H * 0.76);
      }
    });
  };

  return {
    group,
    acc,
    finish,
    sign,
    pool,
    poolMat,
    accMat,
    hit,
    update,
    dispose: () => {
      acc.dispose();
      accMesh?.geometry.dispose();
      sign.dispose();
    },
  };
}

export const zoneDef = (id: KnownAgentId): ZoneDef => ZONES[id];

// ---- props ----------------------------------------------------------------------------------------

/** A lab bench: worktop on a metal frame, with a splash rail. Long axis along x. */
export function bench(env: BuildEnv, x: number, z: number, len: number, ry = 0, depth = 0.9) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.32, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  env.metal.push(m);
  env.matte.push(m);
  env.metal.box(len, 0.08, depth, 0, 0.98, 0, C.steel);
  env.matte.box(len - 0.1, 0.72, depth - 0.12, 0, 0.55, 0, C.graphite);
  env.metal.box(len, 0.06, 0.06, 0, 1.04, -depth / 2 + 0.03, C.brushed);
  for (const sx of [-1, 1]) env.metal.box(0.08, 0.2, depth - 0.1, sx * (len / 2 - 0.05), 0.12, 0, C.metal);
  env.matte.pop();
  env.metal.pop();
}

/** A flask on a bench: glass body and neck, with a liquid. Returns nothing: liquids are static-coloured. */
export function flask(env: BuildEnv, x: number, y: number, z: number, s = 1, liquid: number = C.amber) {
  env.glass.sphere(0.24 * s, x, y + 0.24 * s, z, C.glass);
  env.glass.cyl(0.07 * s, 0.07 * s, 0.34 * s, x, y + 0.54 * s, z, C.glass, 10);
  env.emit.sphere(0.2 * s, x, y + 0.18 * s, z, liquid, 0.7);
}
export function beaker(env: BuildEnv, x: number, y: number, z: number, s = 1) {
  env.glass.cyl(0.14 * s, 0.14 * s, 0.34 * s, x, y + 0.17 * s, z, C.glass, 12);
  env.emit.cyl(0.11 * s, 0.11 * s, 0.12 * s, x, y + 0.09 * s, z, 0x6d8a78, 10);
}
export function tube(env: BuildEnv, x: number, y: number, z: number, h: number, r = 0.05) {
  env.glass.cyl(r, r, h, x, y + h / 2, z, C.glass, 8);
}

/** Server-style rack: a metal body with a dark face. LEDs are added by the department (instanced). */
export function rack(env: BuildEnv, x: number, z: number, h = 3.2, w = 1.05, d = 0.95, ry = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.32, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  env.metal.push(m);
  env.matte.push(m);
  env.metal.box(w, h, d, 0, h / 2, 0, C.metal);
  env.matte.box(w - 0.14, h - 0.2, 0.04, 0, h / 2, d / 2 + 0.005, 0x12130f);
  for (let i = 1; i < 6; i++) env.metal.box(w - 0.1, 0.03, 0.05, 0, (h * i) / 6, d / 2 + 0.02, C.brushed);
  env.matte.pop();
  env.metal.pop();
}

export function cabinet(env: BuildEnv, x: number, z: number, w = 1.4, h = 2.1, d = 0.6, ry = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.32, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  env.metal.push(m);
  env.metal.box(w, h, d, 0, h / 2, 0, C.metal);
  env.metal.box(w - 0.1, h - 0.16, 0.03, 0, h / 2, d / 2 + 0.01, C.brushed);
  env.metal.box(0.03, 0.4, 0.05, w * 0.36, h * 0.5, d / 2 + 0.04, C.steel);
  env.metal.box(0.03, 0.4, 0.05, -w * 0.36, h * 0.5, d / 2 + 0.04, C.steel);
  env.metal.pop();
}

/** A workstation: desk, monitor housing (the lit face goes into `acc`), keyboard slab. Faces +z of its own frame. */
export function terminal(env: BuildEnv, acc: Batch, x: number, z: number, ry = 0, y = 0.32) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  env.metal.push(m);
  acc.push(m);
  env.metal.box(1.5, 0.06, 0.75, 0, 0.74, 0, C.steel);
  env.matte.box(1.4, 0.7, 0.65, 0, 0.36, -0.02, C.graphite);
  env.metal.box(0.9, 0.5, 0.05, 0, 1.28, -0.2, C.metal, 0, -0.14);
  env.metal.box(0.08, 0.3, 0.08, 0, 0.92, -0.22, C.metal);
  acc.box(0.84, 0.44, 0.02, 0, 1.28, -0.17, 0xffffff, 0, -0.14);
  env.metal.box(0.5, 0.02, 0.18, 0, 0.78, 0.18, C.brushed);
  acc.pop();
  env.metal.pop();
}

/** A round column from the floor up. */
export function column(env: BuildEnv, x: number, z: number, h: number, r = 0.28, y = 0) {
  env.metal.cyl(r, r, h, x, y + h / 2, z, C.metal, 14);
  env.metal.cyl(r * 1.35, r * 1.35, 0.12, x, y + 0.06, z, C.brushed, 14);
  env.metal.cyl(r * 1.35, r * 1.35, 0.12, x, y + h - 0.06, z, C.brushed, 14);
}

/** A railing between two points at deck height y: posts, a top rail and (optionally) a glass infill. */
export function railing(env: BuildEnv, x0: number, z0: number, x1: number, z1: number, y: number, h = 1.05, glass = false) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(-(z1 - z0), x1 - x0); // turns a box's local x along the run
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  env.metal.box(len, 0.05, 0.06, cx, y + h, cz, C.steel, ry);
  const n = Math.max(2, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    env.metal.box(0.05, h, 0.05, x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t, C.brushed);
  }
  if (glass) env.glass.box(len, h * 0.78, 0.03, cx, y + h * 0.45, cz, C.glass, ry);
}
