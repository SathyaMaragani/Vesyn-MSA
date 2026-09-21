// Shared, mutable state the hero's layers read every frame. Deliberately NOT React
// state: scroll, mouse and the camera change at 60 Hz and must not re-render anything.
export interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

export interface HeroBus {
  /** Smoothed scroll progress 0..1 (the input is spent by useScrollProgress). */
  progress: number;
  /** Time-based fade-in 0..1 so the first seconds are alive before any scrolling. */
  intro: number;
  /** Smoothed pointer position, -1..1 from the viewport centre. */
  mouseX: number;
  mouseY: number;
  mouseTX: number;
  mouseTY: number;
  /** 0..1, eased toward ctaHoverTarget: the molecular field reacts to the CTA. */
  ctaHover: number;
  ctaHoverTarget: number;
  /** 0..1 after ENTER THE LAB is chosen: a last push forward while the screen fades. */
  enter: number;
  /** Current camera position, for the telemetry readout. */
  cam: { x: number; y: number; z: number };
  /** Camera position in the molecule's own frame, its turn (degrees) and the nearest atom: what the instrument reads. */
  local: { x: number; y: number; z: number };
  /** Where the camera is looking, in the molecule's frame. */
  lookLocal: { x: number; y: number; z: number };
  rotY: number;
  nearest: { index: number; bl: number };
  /** Index along the bond path (the camera's rail) of the path atom nearest the camera. */
  rail: number;
  /** Screen-space positions (px) of anchors in the 3D scene, written by the scene. */
  projected: Record<string, Projected>;
  /** Where the identity's ink sits on screen (px), so the lines that belong to it can hang from it. */
  brand: { left: number; right: number; baseline: number; cap: number; visible: boolean };
  /** Set by the loader once the world may start its opening (true immediately when there is no loader). */
  ready: boolean;
  /** Primary-molecule atom under the pointer, or null. */
  hover: number | null;
  reducedMotion: boolean;
}

export function createBus(): HeroBus {
  return {
    progress: 0,
    intro: 0,
    mouseX: 0,
    mouseY: 0,
    mouseTX: 0,
    mouseTY: 0,
    ctaHover: 0,
    ctaHoverTarget: 0,
    enter: 0,
    cam: { x: 0, y: 0, z: 0 },
    local: { x: 0, y: 0, z: 0 },
    lookLocal: { x: 0, y: 0, z: -1 },
    rotY: 0,
    nearest: { index: 0, bl: 0 },
    rail: 0,
    projected: {},
    brand: { left: 0, right: 0, baseline: 0, cap: 0, visible: false },
    ready: false,
    hover: null,
    reducedMotion: false,
  };
}
