// Cinematic camera moves as pure functions of time (no three.js): tested in tests/facility.test.ts.
//
// A travel never snaps and never flies in a straight line through the building. The camera rises on an
// arc whose height grows with the distance, eases out of one pose and into the next, and its gaze turns a
// beat later than its body, which is what makes a move read as "travelling to" rather than "switching to".
import type { Pose, Vec3 } from "./layout.ts";

export interface Travel {
  from: Pose;
  to: Pose;
  /** seconds (any clock, as long as sample() uses the same one) */
  t0: number;
  dur: number;
  lift: number;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function planTravel(from: Pose, to: Pose, now: number): Travel {
  const d = dist(from.pos, to.pos);
  return {
    from,
    to,
    t0: now,
    dur: Math.min(3.8, Math.max(1.4, 1.1 + d * 0.03)),
    lift: Math.min(14, d * 0.16),
  };
}

export function sampleTravel(tr: Travel, now: number): { pose: Pose; done: boolean; u: number } {
  const u = clamp01((now - tr.t0) / tr.dur);
  const e = easeInOut(u);
  const eLook = easeInOut(clamp01((u - 0.1) / 0.9));
  const { from, to } = tr;
  // position: a quadratic Bezier whose control point is lifted above the chord
  const cx = (from.pos[0] + to.pos[0]) / 2;
  const cy = (from.pos[1] + to.pos[1]) / 2 + tr.lift * 2;
  const cz = (from.pos[2] + to.pos[2]) / 2;
  const a = (1 - e) * (1 - e);
  const b = 2 * (1 - e) * e;
  const c = e * e;
  const pos: Vec3 = [a * from.pos[0] + b * cx + c * to.pos[0], a * from.pos[1] + b * cy + c * to.pos[1], a * from.pos[2] + b * cz + c * to.pos[2]];
  const look: Vec3 = [
    from.look[0] + (to.look[0] - from.look[0]) * eLook,
    from.look[1] + (to.look[1] - from.look[1]) * eLook,
    from.look[2] + (to.look[2] - from.look[2]) * eLook,
  ];
  return { pose: { pos, look }, done: u >= 1, u };
}

/** Catmull-Rom through four control values (uniform). */
function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** A pose along a list of timed keyframes: smooth through every key, eased at both ends. */
export function sampleKeys(keys: readonly { at: number; pose: Pose }[], t: number): Pose {
  const last = keys[keys.length - 1];
  const tt = Math.min(Math.max(t, keys[0].at), last.at);
  let i = 0;
  while (i < keys.length - 2 && tt > keys[i + 1].at) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const u = clamp01((tt - a.at) / (b.at - a.at || 1));
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const mix = (sel: (p: Pose) => Vec3): Vec3 => [0, 1, 2].map((j) => catmull(sel(k0.pose)[j], sel(a.pose)[j], sel(b.pose)[j], sel(k3.pose)[j], u)) as unknown as Vec3;
  return { pos: mix((p) => p.pos), look: mix((p) => p.look) };
}
