// The hero's choreography as pure functions of scroll progress (0..1): where the
// camera is, what each word of the headline is doing, what the instrument reads.
// No DOM, no three.js; tested in tests/hero.test.ts.
//
// THE SCAFFOLD. One oversized molecule is the whole environment. The camera starts far
// outside it, approaches, crosses the headline (which lives IN the scene), rides the
// molecule's own longest bond path with large atoms sweeping past the lens, enters a ring
// of the structure and arrives inside, where the identity is revealed.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Progress of p through [a, b], clamped 0..1. */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export type V3 = [number, number, number];

export const CHAPTERS = [
  { id: "00", label: "ORIGIN", from: 0, to: 0.2 },
  { id: "01", label: "STRUCTURE", from: 0.2, to: 0.42 },
  { id: "02", label: "REASONING", from: 0.42, to: 0.8 },
  { id: "03", label: "IDENTITY", from: 0.8, to: 1.0001 },
] as const;

export const END_THRESHOLD = 0.94;

/** The seven stages of the NEOchems workforce, in the order the run moves through them. */
export const STAGES = ["PLAN", "RESEARCH", "RETROSYNTHESIZE", "VALIDATE", "CRITIQUE", "REPLAN", "EVALUATE"] as const;

export function chapterAt(p: number): number {
  const i = CHAPTERS.findIndex((c) => p >= c.from && p < c.to);
  return i < 0 ? CHAPTERS.length - 1 : i;
}

// --- the headline, in the scene -----------------------------------------------------------

/** The three words, back to front: CHEMISTRY behind the structure, reasoned through it, by machines. in front. */
export const WORDS = ["Chemistry,", "reasoned", "by machines."] as const;

/**
 * How each word moves with scroll, as offsets from its resting place in scene units.
 * CHEMISTRY falls backward, reasoned comes slightly forward, by machines. drifts away past
 * the camera; all three are gone by 90%. `alpha` is the scroll's share of visibility only;
 * proximity to the camera fades a word separately (a word never clips through the lens).
 */
export function wordAt(i: number, p: number): { dz: number; dy: number; alpha: number } {
  const gone = 1 - smooth(seg(p, 0.62 + i * 0.04, 0.9));
  if (i === 0) return { dz: -16 * smooth(seg(p, 0, 0.5)), dy: 0.6 * smooth(seg(p, 0, 0.5)), alpha: gone };
  if (i === 1) return { dz: 7 * smooth(seg(p, 0, 0.42)), dy: 0, alpha: gone };
  return { dz: 13 * smooth(seg(p, 0, 0.34)), dy: -3.2 * smooth(seg(p, 0.05, 0.34)), alpha: gone };
}

/**
 * The opening, by seconds since the loader lifted. CHEMISTRY resolves from a thin outline into
 * solid type; reasoned slides into place; by machines. settles afterwards.
 */
export function wordIntro(i: number, t: number): { solid: number; alpha: number; dx: number; dy: number } {
  if (i === 0) return { solid: smooth(seg(t, 0.5, 3.2)), alpha: smooth(seg(t, 0, 0.9)), dx: 0, dy: 0 };
  if (i === 1) {
    const k = smooth(seg(t, 1.1, 3.0));
    return { solid: k, alpha: smooth(seg(t, 1.1, 2.0)), dx: (1 - k) * -1.6, dy: 0 };
  }
  const k = smooth(seg(t, 2.0, 3.8));
  return { solid: k, alpha: smooth(seg(t, 2.0, 3.0)), dx: 0, dy: (1 - k) * -0.7 };
}

// --- interface layers ------------------------------------------------------------------------

/** Present from the first frame (the intro gates them), gone once the camera closes in. */
export const annotationOpacity = (p: number) => 1 - smooth(seg(p, 0.1, 0.22));
export const structureOpacity = (p: number) => smooth(seg(p, 0.2, 0.29)) * (1 - smooth(seg(p, 0.4, 0.48)));
export const reasoningOpacity = (p: number) => smooth(seg(p, 0.42, 0.5)) * (1 - smooth(seg(p, 0.78, 0.84)));
/** Which of the seven stages is lit while the camera travels the bond path. */
export const activeStage = (p: number) => Math.min(STAGES.length - 1, Math.floor(seg(p, 0.45, 0.74) * STAGES.length));
/** The identity, revealed once the camera is inside the structure. */
export const identityOpacity = (p: number) => smooth(seg(p, 0.88, 0.98));
/**
 * How the name is earned, in order: the structure thins (the last atoms sweep past), NEOchems begins as a
 * hairline outline, resolves into solid type, then the descriptor, then the way in.
 */
export const brandAlpha = (p: number) => smooth(seg(p, 0.8, 0.9));
export const brandSolid = (p: number) => smooth(seg(p, 0.86, 0.97));
export const taglineOpacity = (p: number) => smooth(seg(p, 0.94, 0.985));
export const portalOpacity = (p: number) => smooth(seg(p, 0.955, 0.995));
/** The world settling into its arrival arrangement (distant molecules drift in behind the name; the light warms). */
export const arrivalK = (p: number) => smooth(seg(p, 0.5, 0.94));
export const warmthAt = (p: number) => smooth(seg(p, 0.62, 0.97));
/** The last stretch: the camera stays alive (slow orbit, tiny drift) instead of stopping dead. */
export const settleK = (p: number) => smooth(seg(p, 0.8, 1));
/** Degrees the instrument's outer scale has turned: scroll is its hand. */
export const dialAngle = (p: number) => p * 300;
/** The molecule starts pushed toward the right (fraction of the viewport), and centres as the camera closes in. */
export const shiftAt = (p: number) => 0.17 * (1 - smooth(seg(p, 0.02, 0.32)));
/** Time-based opening (seconds since the loader lifted): alive before any scroll. */
export const introEase = (t: number) => smooth(t / 2.6);
/** Field of view widens as the way in is taken: a sense of speed, not a cut. */
export const fovAt = (base: number, enter: number, p = 0) => base + 20 * smooth(enter) + 4 * smooth(seg(p, 0.72, 1));

/** "12" -> "012" */
export const pad3 = (n: number) => String(Math.round(n)).padStart(3, "0");

// --- the camera --------------------------------------------------------------------------

export interface CamKey {
  t: number;
  pos: V3;
  look: V3;
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a: V3, b: V3, k: number): V3 => add(mul(a, 1 - k), mul(b, k));

/** Ride geometry: how far from the bond the camera may sit, and how close it may come to any atom. */
export const RIDE = { out: 3.4, up: 1.1, clearance: 1.45 };

/**
 * Camera keys for a molecule whose longest bond path runs through `path` (scene-space
 * atom positions, centred on the origin). `radius` is the structure's half-extent, `atoms`
 * are ALL atom positions and `rings` are the centres of its rings.
 *
 * far start -> approach -> cross the headline -> RIDE alongside the bond path -> enter a ring
 * -> arrive inside it. Where the camera sits on the ride is searched, not guessed: around each
 * point of the path it tries positions in a ring (twelve directions, three distances), discards
 * any closer than RIDE.clearance to an atom, and keeps the one that sees the most structure.
 * A relaxation pass then repairs any place the spline still dips toward an atom.
 */
export function buildKeys(path: V3[], radius: number, atoms: V3[] = path, rings: V3[] = [], ringNormals: V3[] = []): CamKey[] {
  const R = radius;
  const up: V3 = [0, 1, 0];
  const usable = path.length > 6 ? path.slice(0, path.length - 2) : path;
  const N = Math.min(13, Math.max(3, usable.length));
  const cone = Math.cos(0.4); // 23 degrees
  const T0 = 0.36;
  const T1 = 0.7;
  const ride: CamKey[] = [];
  for (let k = 0; k < N; k++) {
    const i = Math.round((k / (N - 1)) * (usable.length - 1));
    const base = usable[i];
    const prev = usable[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const tangent = norm(sub(next, prev));
    const outward = len(base) > 0.5 ? norm(base) : up;
    const binormal = norm(cross(tangent, outward));
    const ahead = path.slice(Math.min(path.length - 1, i + 1), Math.min(path.length, i + 5));
    const aim0 = ahead.length ? mul(ahead.reduce((acc, a) => add(acc, a), [0, 0, 0] as V3), 1 / ahead.length) : base;
    const look = lerp3(aim0, [0, 0, 0], 0.25);

    let best: V3 | null = null;
    let bestScore = -1;
    for (let a = 0; a < 12; a++) {
      const phi = (a / 12) * Math.PI * 2;
      const dir = add(mul(outward, Math.cos(phi)), mul(binormal, Math.sin(phi)));
      for (const d of [RIDE.out * 0.75, RIDE.out, RIDE.out * 1.4]) {
        const pos = add(add(base, mul(dir, d)), mul(up, RIDE.up * 0.5));
        let nearest = Infinity;
        for (const at of atoms) nearest = Math.min(nearest, len(sub(at, pos)));
        if (nearest < RIDE.clearance) continue;
        const fwd = norm(sub(look, pos));
        let seen = 0;
        for (const at of atoms) {
          const v = sub(at, pos);
          const vl = len(v);
          if (vl < 60 && (v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]) / (vl || 1) > cone) seen++;
        }
        const score = seen * 10 - d - (dir[1] < -0.6 ? 4 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = pos;
        }
      }
    }
    ride.push({ t: T0 + (k / (N - 1)) * (T1 - T0), pos: best ?? add(add(base, mul(outward, RIDE.out * 1.4)), mul(up, RIDE.up)), look });
  }

  const first = ride[0];
  const last = ride[ride.length - 1];
  const start: CamKey = { t: 0, pos: [-0.22 * R, 0.3 * R, 3.05 * R], look: [0.2 * R, 0.02 * R, 0] };
  const approach: CamKey = { t: 0.15, pos: [0.28 * R, 0.24 * R, 2.05 * R], look: [0.08 * R, 0, 0] };
  const crossing: CamKey = { t: 0.26, pos: lerp3(approach.pos, first.pos, 0.72), look: lerp3(approach.look, first.look, 0.55) };

  // arrive INSIDE a ring: the ring nearest the heart of the structure
  const innerIdx = rings.length ? rings.reduce((bi, c, i) => (len(c) < len(rings[bi]) ? i : bi), 0) : -1;
  const inner = innerIdx >= 0 ? rings[innerIdx] : ([0, 0, 0] as V3);
  const farRing = rings.length > 1 ? rings.reduce((b, c) => (len(sub(c, inner)) > len(sub(b, inner)) ? c : b), rings[0]) : mul(sub(last.pos, inner), -1);
  // The arrival is at the MOUTH of the ring, looking through it: the ring frames what is revealed
  // and nothing crosses the lens. (Standing at the ring's centre put a bond in front of the identity.)
  let axis: V3 = innerIdx >= 0 && ringNormals[innerIdx] ? ringNormals[innerIdx] : norm(sub(last.pos, inner));
  if (axis[0] * (last.pos[0] - inner[0]) + axis[1] * (last.pos[1] - inner[1]) + axis[2] * (last.pos[2] - inner[2]) < 0) axis = mul(axis, -1);
  const mouth = add(inner, mul(axis, 3.6));
  const through = lerp3(add(inner, mul(axis, -9)), farRing, 0.25);
  const entering: CamKey = { t: 0.84, pos: lerp3(last.pos, mouth, 0.7), look: lerp3(inner, through, 0.6) };
  const end: CamKey = { t: 1, pos: mouth, look: through };

  return relaxClearance([start, approach, crossing, ...ride, entering, end], atoms);
}

/**
 * The spline between two safe keys can still dip toward an atom. Sample the finished path;
 * wherever it comes closer than RIDE.clearance, insert a key that pushes it back out. A few
 * passes converge (each insertion only ever moves the path away from atoms).
 */
function relaxClearance(keys: CamKey[], atoms: V3[]): CamKey[] {
  const out = [...keys];
  const margin = RIDE.clearance * 1.15;
  for (let pass = 0; pass < 12; pass++) {
    let fixed = 0;
    for (let p = 0.2; p <= 1.0001; p += 0.0025) {
      const c = cameraAt(out, Math.min(1, p));
      let nearest = Infinity;
      let at: V3 = atoms[0];
      for (const a of atoms) {
        const d = len(sub(a, c.pos));
        if (d < nearest) {
          nearest = d;
          at = a;
        }
      }
      if (nearest >= RIDE.clearance) continue;
      if (out.some((k) => Math.abs(k.t - p) < 0.001)) continue;
      const away = norm(sub(c.pos, at));
      const idx = out.findIndex((k) => k.t > p);
      out.splice(idx < 0 ? out.length : idx, 0, { t: Math.min(1, p), pos: add(at, mul(away, margin)), look: c.look });
      fixed++;
    }
    if (fixed === 0) break;
  }
  return out;
}

/** Uniform Catmull-Rom through four control values. */
function catmull(p0: V3, p1: V3, p2: V3, p3: V3, u: number): V3 {
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

export function cameraAt(keys: CamKey[], progress: number): { pos: V3; look: V3 } {
  const p = clamp01(progress);
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = clamp01((p - a.t) / (b.t - a.t || 1));
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  return { pos: catmull(k0.pos, a.pos, b.pos, k3.pos, u), look: catmull(k0.look, a.look, b.look, k3.look, u) };
}

/** The atom nearest a point, and how far (in scene units). Used by the instrument's "nearest atom" readout. */
export function nearestAtom(atoms: V3[], p: V3): { index: number; dist: number } {
  let index = 0;
  let dist = Infinity;
  for (let i = 0; i < atoms.length; i++) {
    const d = len(sub(atoms[i], p));
    if (d < dist) {
      dist = d;
      index = i;
    }
  }
  return { index, dist };
}
