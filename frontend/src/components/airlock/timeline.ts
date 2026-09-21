// The airlock's scroll story as pure functions of progress p in [0, 1].
// Kept separate from the three.js code so the choreography is readable and testable.
import { LAB_OVERVIEW, type Vec3 } from "../world/cameraPoses.ts";

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** 0 before a, 1 after b, linear in between. */
export const seg = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));

/** Story beats. Frame numbers follow the product brief. */
export const BEATS = {
  offline: { from: 0, to: 0.14 }, // Frame 0: facility offline
  init: { from: 0.14, to: 0.34 }, // Frame 1: systems initialise
  open: { from: 0.34, to: 0.52 }, // Frame 2: airlock opens
  enter: { from: 0.52, to: 0.7 }, // Frame 3: camera enters the lab
  alive: { from: 0.66, to: 0.9 }, // Frame 4: workstations power up
  ready: { from: 0.92, to: 1 }, // Frame 5: lab ready
} as const;

export const INIT_LINES = ["CORE ONLINE", "AGENT NETWORK ONLINE", "SCIENTIFIC TOOLS ONLINE", "AUDIT SYSTEM READY"] as const;

interface Key {
  p: number;
  pos: Vec3;
  look: Vec3;
}

/** Camera path: down the corridor, through the doors, then a rise to the lab's overview pose. */
export const CAMERA_KEYS: readonly Key[] = [
  { p: 0, pos: [0, 2.3, 68], look: [0, 2.3, 40] },
  { p: 0.14, pos: [0, 2.3, 62], look: [0, 2.3, 36] },
  { p: 0.34, pos: [0, 2.3, 45], look: [0, 2.4, 22] },
  { p: 0.52, pos: [0, 2.4, 34], look: [0, 2.4, 10] },
  { p: 0.7, pos: [0, 3.0, 16], look: [0, 2.2, -4] },
  { p: 0.9, pos: LAB_OVERVIEW.pos, look: LAB_OVERVIEW.look },
  { p: 1, pos: LAB_OVERVIEW.pos, look: LAB_OVERVIEW.look },
];

const lerp3 = (a: Vec3, b: Vec3, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function cameraAt(p: number): { pos: [number, number, number]; look: [number, number, number] } {
  const q = clamp01(p);
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (q <= b.p) {
      const t = smooth((q - a.p) / (b.p - a.p));
      return { pos: lerp3(a.pos, b.pos, t), look: lerp3(a.look, b.look, t) };
    }
  }
  const last = CAMERA_KEYS[CAMERA_KEYS.length - 1];
  return { pos: [...last.pos], look: [...last.look] };
}

/** Fraction the doors are open (0 closed, 1 fully open). */
export const doorOpen = (p: number): number => smooth(seg(p, BEATS.open.from, BEATS.open.to));

/** Corridor light sweep: 0..1 across the init beat. */
export const corridorPower = (p: number): number => seg(p, BEATS.init.from, BEATS.init.to);

/** Power of workstation `i` of `n` (workflow order) - they come alive one after another. */
export function stationPower(p: number, i: number, n: number): number {
  const start = BEATS.alive.from + (i / n) * 0.14;
  return smooth(seg(p, start, start + 0.08));
}

export const corePower = (p: number): number => smooth(seg(p, 0.7, 0.84));

/** Opacity of the title block (Frame 0). */
export const titleOpacity = (p: number): number => 1 - seg(p, 0.05, BEATS.offline.to);

/** How many of the staged init lines are showing (each "ticks" in turn). */
export const initLinesShown = (p: number): number => Math.floor(seg(p, 0.16, 0.32) * (INIT_LINES.length + 0.999));
export const initBlockOpacity = (p: number): number => Math.min(seg(p, 0.14, 0.17), 1 - seg(p, 0.4, 0.5));

export const openingOpacity = (p: number): number => Math.min(seg(p, 0.36, 0.4), 1 - seg(p, 0.5, 0.56));
export const rosterOpacity = (p: number): number => Math.min(seg(p, 0.72, 0.78), 1 - seg(p, 0.9, 0.93));
export const readyOpacity = (p: number): number => seg(p, BEATS.ready.from, 0.97);
export const READY_THRESHOLD = 0.96;
