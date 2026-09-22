// Building blocks for the facility: the palette, batched static geometry and shared materials.
//
// PERFORMANCE: the architecture and equipment are thousands of small parts. They are never separate
// meshes: every part is added to a Batch with a colour, and each Batch is merged into ONE mesh
// (vertex colours), so the whole static facility is a handful of draw calls. Only what has to change
// with state (accents, lamps, screens, moving parts) is a separate object.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** The Vesyn palette: graphite, warm black, warm ivory, mineral green, sage, oxidized copper, soft amber. */
export const C = {
  floor: 0x181917,
  floorLine: 0x0f100e,
  warmBlack: 0x10110f,
  graphite: 0x1a1b18,
  panel: 0x262723,
  metal: 0x353733,
  brushed: 0x4d4e49,
  steel: 0x8e8b80,
  smoke: 0xa9a79c,
  ivory: 0xe8e4d8,
  stone: 0xc9c1a8,
  sage: 0x8faf9a,
  mineral: 0x55806a,
  copper: 0xb87552,
  amber: 0xd6a45b,
  warn: 0xb5533c,
  glass: 0xa9bdb0,
} as const;

/** Merge target: parts are added in LOCAL coordinates, under an optional base transform (a department's placement). */
export class Batch {
  private parts: THREE.BufferGeometry[] = [];
  private base = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private local = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private col = new THREE.Color();
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private cylGeo = new Map<number, THREE.CylinderGeometry>();
  private sphGeo = new THREE.SphereGeometry(1, 14, 10);

  /** Everything added until pop() is placed by `m` (composed with any outer placement). */
  push(m: THREE.Matrix4) {
    this.stack.push(this.base.clone());
    this.base.multiply(m);
  }
  pop() {
    const b = this.stack.pop();
    if (b) this.base.copy(b);
  }

  private commit(geo: THREE.BufferGeometry, color: number) {
    geo.applyMatrix4(this.local);
    geo.applyMatrix4(this.base);
    const n = geo.getAttribute("position").count;
    const c = new Float32Array(n * 3);
    this.col.set(color);
    for (let i = 0; i < n; i++) {
      c[i * 3] = this.col.r;
      c[i * 3 + 1] = this.col.g;
      c[i * 3 + 2] = this.col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    this.parts.push(geo);
  }

  private place(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, rx: number, rz: number) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.local.compose(this.p, this.q, this.s);
  }

  /** A box centred at (x, y, z). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0, rz = 0) {
    this.place(x, y, z, w, h, d, ry, rx, rz);
    this.commit(this.boxGeo.clone(), color);
  }
  /** A cylinder (or cone) centred at (x, y, z), axis along y. */
  cyl(rTop: number, rBottom: number, h: number, x: number, y: number, z: number, color: number, seg = 16, ry = 0, rx = 0, rz = 0) {
    const key = Math.round((rTop / (rBottom || 1e-6)) * 1000) * 100 + seg;
    let g = this.cylGeo.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(rTop / (rBottom || 1e-6), 1, 1, seg, 1);
      this.cylGeo.set(key, g);
    }
    this.place(x, y, z, rBottom, h, rBottom, ry, rx, rz);
    this.commit(g.clone(), color);
  }
  sphere(r: number, x: number, y: number, z: number, color: number, sy = 1) {
    this.place(x, y, z, r, r * sy, r, 0, 0, 0);
    this.commit(this.sphGeo.clone(), color);
  }
  /** A part from any indexed geometry. */
  geo(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number, scale = 1, ry = 0, rx = 0, rz = 0) {
    this.place(x, y, z, scale, scale, scale, ry, rx, rz);
    this.commit(g.clone(), color);
  }

  build(material: THREE.Material, shadows = true): THREE.Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) return null;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
  dispose() {
    this.boxGeo.dispose();
    this.sphGeo.dispose();
    for (const g of this.cylGeo.values()) g.dispose();
    for (const p of this.parts) p.dispose();
  }
}

export interface Mats {
  metal: THREE.MeshStandardMaterial;
  matte: THREE.MeshLambertMaterial;
  glass: THREE.MeshStandardMaterial;
  emit: THREE.MeshBasicMaterial;
  dispose: () => void;
}

/** The four shared static materials. `env` is the reflection environment set on the scene. */
export function makeMats(): Mats {
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.88, envMapIntensity: 1.15 });
  // matte surfaces (most of the screen) use the cheap diffuse model; only metal and glass pay for reflections
  const matte = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });
  const emit = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return { metal, matte, glass, emit, dispose: () => [metal, matte, glass, emit].forEach((m) => m.dispose()) };
}

/**
 * Polished dark stone: large slabs with hairline joints, fine grain and gentle mottling. The texture covers
 * 2 x 2 slabs of 4 m. (Deliberately NOT a grid of tiles: a tiled floor reads as a bathroom, and a grid at
 * this scale reads as a checkerboard. Slab tone varies by a few levels at most.)
 */
export function floorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  let s = 7;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  g.fillStyle = "#26272a";
  g.fillRect(0, 0, size, size);
  const n = 2;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = 38 + Math.floor(r() * 4);
      g.fillStyle = `rgb(${v},${v + 1},${v - 1})`;
      g.fillRect((i * size) / n, (j * size) / n, size / n, size / n);
      // mottling
      for (let k = 0; k < 14; k++) {
        const x = (i * size) / n + r() * (size / n);
        const y = (j * size) / n + r() * (size / n);
        const rad = 40 + r() * 140;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        const on = r() < 0.5;
        grd.addColorStop(0, on ? "rgba(255,246,228,0.045)" : "rgba(0,0,0,0.07)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  // terrazzo grain
  for (let k = 0; k < 9000; k++) {
    const x = r() * size;
    const y = r() * size;
    const l = r();
    g.fillStyle = l < 0.55 ? "rgba(0,0,0,0.22)" : l < 0.9 ? "rgba(220,214,196,0.10)" : "rgba(210,176,130,0.16)";
    const w = 1 + r() * 2.2;
    g.fillRect(x, y, w, w * (0.6 + r() * 0.6));
  }
  // joints: hairlines with a faint highlight beside them
  g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    const p = (i * size) / n;
    g.strokeStyle = "rgba(6,6,5,0.9)";
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
    g.strokeStyle = "rgba(230,222,200,0.06)";
    g.beginPath();
    g.moveTo(p + 2, 0);
    g.lineTo(p + 2, size);
    g.moveTo(0, p + 2);
    g.lineTo(size, p + 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Soft radial glow: additive sprites and floor light pools. */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A tall soft-edged gradient: one light shaft. */
export function shaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = "destination-in";
  const along = g.createLinearGradient(0, 0, 0, 256);
  along.addColorStop(0, "rgba(0,0,0,1)");
  along.addColorStop(0.6, "rgba(0,0,0,0.3)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = along;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const tmp = new THREE.Color();
/** Ease a colour toward a hex without allocating. */
export function easeColor(c: THREE.Color, hex: number, k: number) {
  c.lerp(tmp.set(hex), k);
}

/** Time-based smoothing factor: the same feel at 5 fps and at 144 fps. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * Math.min(dt, 0.25));
