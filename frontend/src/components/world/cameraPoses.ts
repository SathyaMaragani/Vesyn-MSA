// Camera poses shared by the airlock and the lab. The airlock's last frame is the
// lab's default view, so entering the lab continues from where the camera stopped.
export type Vec3 = readonly [number, number, number];

export interface Pose {
  pos: Vec3;
  look: Vec3;
}

export type CameraPreset = "overview" | "flow" | "planning" | "validation";

export const CAMERA_PRESETS: Record<CameraPreset, Pose & { label: string }> = {
  overview: { label: "Overview", pos: [0, 15, 27], look: [0, 1, -1] },
  flow: { label: "Flow", pos: [0, 36, 0.1], look: [0, 0, 0] },
  planning: { label: "Planning", pos: [-21, 9, 12], look: [-8, 1.5, 0] },
  validation: { label: "Validation", pos: [21, 9, 12], look: [8, 1.5, 0] },
};

export const LAB_OVERVIEW: Pose = CAMERA_PRESETS.overview;

/** Pose that frames one workstation from the outside, looking toward the core. */
export function agentPose(position: Vec3): Pose {
  const [x, , z] = position;
  const d = Math.hypot(x, z) || 1;
  const ox = (x / d) * 7;
  const oz = (z / d) * 7;
  return { pos: [x + ox, 6.5, z + oz], look: [x, 1.8, z] };
}

export const CORE_POSE: Pose = { pos: [0, 6.5, 11], look: [0, 2, 0] };
