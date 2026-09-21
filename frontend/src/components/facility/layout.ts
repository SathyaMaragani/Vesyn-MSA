// The NeoChems research facility as a plan: where each department stands, how it faces, and
// the camera poses that frame it. Pure data and functions (no three.js), tested in tests/facility.test.ts.
//
// The plan, north at the top (the lab is entered from the south, +z):
//
//                        RESEARCH
//                           |
//   RETROSYNTHESIS --- MOLECULAR CORE --- VALIDATION       (the core is ringed by the planner's
//                           |                                orchestration gallery, one level up)
//              REPLANNER -- CRITIC -- EVALUATOR
//
// Every department's open side faces the core. Units are metres.
import type { KnownAgentId } from "../../types/agents.ts";

export type Vec3 = readonly [number, number, number];

export interface ZoneDef {
  id: KnownAgentId;
  /** Department number on its signage. */
  number: string;
  /** Static signage; the roster's own name (from the backend) is used wherever it is known. */
  title: string;
  discipline: string;
  x: number;
  z: number;
  /** Footprint (width across, depth toward the core). */
  w: number;
  d: number;
  /** Height of the floor this department stands on. */
  floor: number;
  /** Camera framing: offset of the camera from the department centre, and the point it looks at (relative). */
  cam: Vec3;
  look: Vec3;
}

export const ZONES: Record<KnownAgentId, ZoneDef> = {
  planner: { id: "planner", number: "00", title: "ORCHESTRATION", discipline: "WORKFLOW CONTROL", x: -7.4, z: -7.4, w: 7, d: 5, floor: 4.6, cam: [10.5, 8.2, 12.5], look: [0, 1.3, 0] },
  research: { id: "research", number: "01", title: "RESEARCH", discipline: "COMPUTATIONAL RESEARCH", x: 0, z: -25, w: 24, d: 13, floor: 0, cam: [17, 10, 14], look: [0, 1.5, 0] },
  retro: { id: "retro", number: "02", title: "RETROSYNTHESIS", discipline: "SYNTHESIS PLANNING", x: -27, z: -2, w: 16, d: 24, floor: 0, cam: [14, 10.5, 15], look: [0, 1.5, 0] },
  validator: { id: "validator", number: "03", title: "VALIDATION", discipline: "REACTION VALIDATION", x: 27, z: -2, w: 16, d: 22, floor: 0, cam: [-14, 10.5, 15], look: [0, 1.5, 0] },
  critic: { id: "critic", number: "04", title: "CRITIC", discipline: "ROUTE REVIEW", x: 0, z: 25, w: 18, d: 12, floor: 0, cam: [15, 10, -14], look: [0, 1.2, 1] },
  replanner: { id: "replanner", number: "05", title: "REPLANNER", discipline: "ADAPTIVE PLANNING", x: -21, z: 19, w: 15, d: 12, floor: 0, cam: [8, 10, -12], look: [0, 1.2, 0] },
  evaluator: { id: "evaluator", number: "06", title: "EVALUATOR", discipline: "ROUTE EVALUATION", x: 21, z: 19, w: 15, d: 12, floor: 0, cam: [-8, 10, -12], look: [0, 1.2, 0] },
};

export const ZONE_LIST: readonly ZoneDef[] = Object.values(ZONES);

/** Direction a department faces: from it toward the core (unit vector in the plan). */
export function facing(z: ZoneDef): [number, number] {
  const l = Math.hypot(z.x, z.z) || 1;
  return [-z.x / l, -z.z / l];
}

/** three.js yaw that turns a department's local +z (its open side) toward the core. */
export function yawOf(z: ZoneDef): number {
  return Math.atan2(-z.x, -z.z);
}

/** Where a department's overhead conduit port is: the point the workflow cables attach to. */
export function port(z: ZoneDef): [number, number, number] {
  if (z.id === "planner") return [z.x, z.floor + 3.2, z.z];
  const [fx, fz] = facing(z);
  const reach = z.d / 2 + 0.5;
  return [z.x + fx * reach, 5.6, z.z + fz * reach];
}

export interface Pose {
  pos: Vec3;
  look: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The camera pose that frames one department. */
export function zonePose(id: KnownAgentId): Pose {
  const z = ZONES[id];
  const c: Vec3 = [z.x, z.floor, z.z];
  return { pos: add(c, z.cam), look: add(c, z.look) };
}

export const OVERVIEW: Pose = { pos: [0, 45, 53], look: [0, 0, 0] };
/** Straight down: the conduits and the plan of the whole facility. */
export const FLOW: Pose = { pos: [0, 92, 3], look: [0, 0, 0] };
/** The molecular chamber, from the walkway that leads to it. */
export const CORE_POSE: Pose = { pos: [0, 10.5, 24], look: [0, 5.0, 0] };
/** Close on the molecule itself. */
export const MOLECULE_POSE: Pose = { pos: [-2.6, 6.6, 14.2], look: [0.6, 5.2, 0] };
/** The route table in the retrosynthesis hall. */
export const ROUTE_TABLE: Vec3 = [-27, 0, -2];
export const ROUTE_POSE: Pose = { pos: [-14.5, 8.5, 9], look: [-27, 1.8, -2] };

export type ShotName = "overview" | "flow";
export const SHOTS: Record<ShotName, Pose & { label: string }> = {
  overview: { label: "Overview", ...OVERVIEW },
  flow: { label: "Flow", ...FLOW },
};

/** The route in the arrival: through the south entrance, to the chamber, then back and up to the overview. */
export const ARRIVAL: { at: number; pose: Pose }[] = [
  { at: 0, pose: { pos: [3, 2.4, 58], look: [0, 3.4, 0] } },
  { at: 2.6, pose: { pos: [1.2, 3.6, 13], look: [0, 3.4, 0] } },
  { at: 4.2, pose: { pos: [0.4, 3.9, 9.4], look: [0, 3.4, 0] } },
  { at: 7.2, pose: { pos: [0, 45, 53], look: [0, 0, 0] } },
];
