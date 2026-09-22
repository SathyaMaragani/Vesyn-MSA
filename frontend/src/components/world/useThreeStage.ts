"use client";

// Shared plumbing for both 3D stages (airlock + lab): renderer, camera, resize,
// render loop and disposal. Callers supply what to draw each frame.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  size: () => { width: number; height: number };
}

export interface StageOptions {
  background: number;
  fogDensity: number;
  fov?: number;
  /** Cap on devicePixelRatio; the hero passes a lower cap to protect frame rate at 4K. */
  maxPixelRatio?: number;
  /** MSAA. On by default; the hero measures frame rate on integrated GPUs and may turn it off. */
  antialias?: boolean;
  /** Transparent canvas: the page shows through, so type can sit behind the 3D. `background` still sets the fog colour. */
  transparent?: boolean;
  /** Replace the default `renderer.render(scene, camera)` (post-processing). */
  render?: (stage: Stage) => void;
  /** Called on resize with the new CSS size, so post-processing targets can follow. */
  onResize?: (width: number, height: number, stage: Stage) => void;
  /** Enable the renderer's shadow map (PCF). */
  shadows?: boolean;
  /** Build the scene contents once. Return a cleanup. */
  setup: (stage: Stage) => (() => void) | void;
  /** Called every frame with elapsed seconds and delta seconds. */
  frame: (stage: Stage, t: number, dt: number) => void;
}

/** Mounts a WebGL stage into the returned ref. `failed` is true when WebGL is unavailable. */
export function useThreeStage(options: StageOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const opts = useRef(options);
  opts.current = options;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: opts.current.antialias ?? true, alpha: opts.current.transparent ?? false, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.current.maxPixelRatio ?? 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    if (opts.current.shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    container.prepend(renderer.domElement);
    const canvas = renderer.domElement;
    canvas.style.display = "block";

    const scene = new THREE.Scene();
    if (opts.current.transparent) renderer.setClearColor(0x000000, 0);
    else scene.background = new THREE.Color(opts.current.background);
    scene.fog = new THREE.FogExp2(opts.current.background, opts.current.fogDensity);

    let width = container.clientWidth || 1;
    let height = container.clientHeight || 1;
    renderer.setSize(width, height);
    const camera = new THREE.PerspectiveCamera(opts.current.fov ?? 38, width / height, 0.1, 260);

    const stage: Stage = { renderer, scene, camera, canvas, size: () => ({ width, height }) };
    const cleanupSetup = opts.current.setup(stage);

    const observer = new ResizeObserver(() => {
      width = container.clientWidth || 1;
      height = container.clientHeight || 1;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      opts.current.onResize?.(width, height, stage);
    });
    observer.observe(container);

    const timer = new THREE.Timer(); // THREE.Clock is deprecated as of r185
    timer.connect(document); // a hidden tab does not come back with one enormous frame
    let raf = 0;
    const tick = (now?: number) => {
      raf = requestAnimationFrame(tick);
      timer.update(now);
      opts.current.frame(stage, timer.getElapsed(), timer.getDelta());
      if (opts.current.render) opts.current.render(stage);
      else renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      timer.dispose();
      observer.disconnect();
      cleanupSetup?.();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return { containerRef, failed };
}
