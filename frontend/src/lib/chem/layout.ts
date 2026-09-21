// Coordinates for a parsed molecule. These are a LAYOUT - a relaxed arrangement of
// the real bond graph (bonded atoms about one unit apart, everything else pushed
// apart) - not a computed conformer, and the UI labels them so. Deterministic: the
// same SMILES always gives the same picture.
import type { MolGraph } from "./smiles.ts";

export const BOND_LENGTH = 1;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relaxed 3D positions, flat [x0,y0,z0, x1,...], centred on the origin. */
export function layout3D(g: MolGraph, iterations = 420): Float32Array {
  const n = g.atoms.length;
  const p = new Float64Array(n * 3);
  const rand = rng(n * 7919 + g.bonds.length);

  // Seed: walk the bond graph so bonded atoms start near each other.
  const adj: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    adj[b.a].push(b.b);
    adj[b.b].push(b.a);
  }
  const placed = new Array<boolean>(n).fill(false);
  const queue: number[] = [];
  for (let start = 0; start < n; start++) {
    if (placed[start]) continue;
    placed[start] = true;
    p[start * 3] = start === 0 ? 0 : (rand() - 0.5) * 6 + start * 0.5;
    p[start * 3 + 1] = (rand() - 0.5) * 2;
    p[start * 3 + 2] = (rand() - 0.5) * 2;
    queue.push(start);
    while (queue.length) {
      const u = queue.shift() as number;
      for (const v of adj[u]) {
        if (placed[v]) continue;
        placed[v] = true;
        p[v * 3] = p[u * 3] + (rand() - 0.5) * 1.6;
        p[v * 3 + 1] = p[u * 3 + 1] + (rand() - 0.5) * 1.6;
        p[v * 3 + 2] = p[u * 3 + 2] + (rand() - 0.5) * 1.6;
        queue.push(v);
      }
    }
  }

  const f = new Float64Array(n * 3);
  for (let it = 0; it < iterations; it++) {
    f.fill(0);
    const cool = 1 - it / iterations;
    // repulsion between every pair (n is small: a drug-like molecule is < 100 heavy atoms)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = p[i * 3] - p[j * 3];
        let dy = p[i * 3 + 1] - p[j * 3 + 1];
        let dz = p[i * 3 + 2] - p[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const inv = 0.32 / d2; // 1/d^2 falloff
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        dz /= d;
        f[i * 3] += dx * inv;
        f[i * 3 + 1] += dy * inv;
        f[i * 3 + 2] += dz * inv;
        f[j * 3] -= dx * inv;
        f[j * 3 + 1] -= dy * inv;
        f[j * 3 + 2] -= dz * inv;
      }
    }
    // springs along bonds
    for (const b of g.bonds) {
      const dx = p[b.b * 3] - p[b.a * 3];
      const dy = p[b.b * 3 + 1] - p[b.a * 3 + 1];
      const dz = p[b.b * 3 + 2] - p[b.a * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9;
      const rest = b.order === 3 ? BOND_LENGTH * 0.9 : b.order === 2 ? BOND_LENGTH * 0.95 : BOND_LENGTH;
      const s = (d - rest) * 6;
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;
      f[b.a * 3] += ux * s;
      f[b.a * 3 + 1] += uy * s;
      f[b.a * 3 + 2] += uz * s;
      f[b.b * 3] -= ux * s;
      f[b.b * 3 + 1] -= uy * s;
      f[b.b * 3 + 2] -= uz * s;
    }
    const step = 0.06 * (0.25 + 0.75 * cool);
    for (let k = 0; k < n * 3; k++) p[k] += Math.max(-0.4, Math.min(0.4, f[k] * step));
  }

  // centre
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += p[i * 3];
    cy += p[i * 3 + 1];
    cz += p[i * 3 + 2];
  }
  cx /= n || 1;
  cy /= n || 1;
  cz /= n || 1;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = p[i * 3] - cx;
    out[i * 3 + 1] = p[i * 3 + 1] - cy;
    out[i * 3 + 2] = p[i * 3 + 2] - cz;
  }
  return out;
}

/** Radius of the smallest origin-centred sphere holding every atom centre. */
export function extent(p: Float32Array): number {
  let r = 0;
  for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i], p[i + 1], p[i + 2]));
  return r;
}

/**
 * A flat depiction: the 3D layout projected onto its best-fit plane (the two
 * directions of greatest spread), so the drawing overlaps as little as possible.
 * Returns [x0,y0, x1,y1, ...] centred on the origin.
 */
export function layout2D(g: MolGraph): Float32Array {
  const n = g.atoms.length;
  const p = layout3D(g);
  if (n === 1) return new Float32Array([0, 0]);

  // covariance
  const c = [0, 0, 0, 0, 0, 0]; // xx xy xz yy yz zz
  for (let i = 0; i < n; i++) {
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    const z = p[i * 3 + 2];
    c[0] += x * x;
    c[1] += x * y;
    c[2] += x * z;
    c[3] += y * y;
    c[4] += y * z;
    c[5] += z * z;
  }
  const mul = (v: number[]): number[] => [
    c[0] * v[0] + c[1] * v[1] + c[2] * v[2],
    c[1] * v[0] + c[3] * v[1] + c[4] * v[2],
    c[2] * v[0] + c[4] * v[1] + c[5] * v[2],
  ];
  const norm = (v: number[]): number[] => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  let e1 = norm([1, 0.37, 0.21]);
  for (let k = 0; k < 60; k++) e1 = norm(mul(e1));
  let e2 = norm([0.13, 1, 0.55]);
  for (let k = 0; k < 60; k++) {
    const d = e2[0] * e1[0] + e2[1] * e1[1] + e2[2] * e1[2];
    e2 = norm(mul([e2[0] - d * e1[0], e2[1] - d * e1[1], e2[2] - d * e1[2]]));
  }
  const d = e2[0] * e1[0] + e2[1] * e1[1] + e2[2] * e1[2];
  e2 = norm([e2[0] - d * e1[0], e2[1] - d * e1[1], e2[2] - d * e1[2]]);

  const q = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    q[i * 2] = p[i * 3] * e1[0] + p[i * 3 + 1] * e1[1] + p[i * 3 + 2] * e1[2];
    q[i * 2 + 1] = p[i * 3] * e2[0] + p[i * 3 + 1] * e2[1] + p[i * 3 + 2] * e2[2];
  }
  relax2D(g, q);
  return Float32Array.from(q);
}

/**
 * Planar relaxation with bond-angle terms, so rings come out as regular polygons
 * and substituents fan out at about 120 degrees, as they are drawn on paper.
 */
function relax2D(g: MolGraph, q: Float64Array, iterations = 360): void {
  const n = g.atoms.length;
  const nb: number[][] = g.atoms.map(() => []);
  const triple = new Array<boolean>(n).fill(false);
  for (const b of g.bonds) {
    nb[b.a].push(b.b);
    nb[b.b].push(b.a);
    if (b.order === 3) triple[b.a] = triple[b.b] = true;
  }
  const ideal = (i: number): number => {
    const d = nb[i].length;
    if (triple[i]) return Math.PI;
    if (d <= 3) return (2 * Math.PI) / 3;
    if (d === 4) return Math.PI / 2;
    return (2 * Math.PI) / d;
  };
  const f = new Float64Array(n * 2);
  for (let it = 0; it < iterations; it++) {
    f.fill(0);
    const cool = 0.3 + 0.7 * (1 - it / iterations);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = q[i * 2] - q[j * 2];
        const dy = q[i * 2 + 1] - q[j * 2 + 1];
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        const inv = 0.22 / d2;
        f[i * 2] += (dx / d) * inv;
        f[i * 2 + 1] += (dy / d) * inv;
        f[j * 2] -= (dx / d) * inv;
        f[j * 2 + 1] -= (dy / d) * inv;
      }
    }
    for (const b of g.bonds) {
      const dx = q[b.b * 2] - q[b.a * 2];
      const dy = q[b.b * 2 + 1] - q[b.a * 2 + 1];
      const d = Math.hypot(dx, dy) + 1e-9;
      const s = (d - BOND_LENGTH) * 6;
      f[b.a * 2] += (dx / d) * s;
      f[b.a * 2 + 1] += (dy / d) * s;
      f[b.b * 2] -= (dx / d) * s;
      f[b.b * 2 + 1] -= (dy / d) * s;
    }
    // angle terms: rotate each neighbour pair about their shared atom toward the ideal angle
    for (let i = 0; i < n; i++) {
      const target = ideal(i);
      for (let u = 0; u < nb[i].length; u++) {
        for (let v = u + 1; v < nb[i].length; v++) {
          const j = nb[i][u];
          const k = nb[i][v];
          const ax = q[j * 2] - q[i * 2];
          const ay = q[j * 2 + 1] - q[i * 2 + 1];
          const bx = q[k * 2] - q[i * 2];
          const by = q[k * 2 + 1] - q[i * 2 + 1];
          const la = Math.hypot(ax, ay) + 1e-9;
          const lb = Math.hypot(bx, by) + 1e-9;
          const cross = ax * by - ay * bx;
          const theta = Math.atan2(Math.abs(cross), ax * bx + ay * by);
          const e = theta - target;
          const sgn = cross >= 0 ? 1 : -1;
          const k1 = 1.1 * e * sgn;
          f[j * 2] += (-ay / la) * k1;
          f[j * 2 + 1] += (ax / la) * k1;
          f[k * 2] -= (-by / lb) * k1;
          f[k * 2 + 1] -= (bx / lb) * k1;
        }
      }
    }
    const step = 0.05 * cool;
    for (let k = 0; k < n * 2; k++) q[k] += Math.max(-0.3, Math.min(0.3, f[k] * step));
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += q[i * 2];
    cy += q[i * 2 + 1];
  }
  cx /= n || 1;
  cy /= n || 1;
  for (let i = 0; i < n; i++) {
    q[i * 2] -= cx;
    q[i * 2 + 1] -= cy;
  }
}
