"use client";

import React, { useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useThreeStage } from "@/components/world/useThreeStage";
import { createDof, type Dof } from "./dof";
import type { HeroBus } from "./heroBus";
import { createHeroWorld, type HeroFacts, type HeroWorld } from "./heroWorld";
import { brandAlpha, cameraAt, fovAt, introEase, nearestAtom, seg, settleK, shiftAt, type V3 } from "./journey";

const FOG = 0x10110f;
const BASE_FOV = 34;
const FOG_DENSITY = 0.0105;
const UP = new THREE.Vector3(0, 1, 0);
const BRAND_FOCUS = 12; // the name is set 12 units ahead of the arrival camera

/**
 * The WebGL layer: the whole hero scene, including the headline. The camera rides along the
 * molecule's own bond path IN the molecule's frame (so the molecule can drift and turn and the
 * camera stays on its rail), the pointer is a physical ray that pushes the structure, and a real
 * depth-of-field pass blurs everything by its distance from the focus (the atoms ahead).
 */
export function ScaffoldScene({ bus, onFacts }: { bus: HeroBus; onFacts?: (f: HeroFacts) => void }) {
  const worldRef = useRef<HeroWorld | null>(null);
  const dofRef = useRef<Dof | null>(null);
  const focusRef = useRef(24);
  const startRef = useRef<number | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const ndc = useRef(new THREE.Vector2());
  const frameNo = useRef(0);
  const laidOutFor = useRef("");
  const tmp = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3(), local: new THREE.Vector3(), inv: new THREE.Matrix4() });

  const { containerRef, failed } = useThreeStage({
    background: FOG,
    fogDensity: FOG_DENSITY,
    fov: BASE_FOV,
    maxPixelRatio: 1.5,
    antialias: false, // the scene renders into the DOF target; its pass smooths edges itself
    transparent: true,
    shadows: true,
    setup: (stage) => {
      const { renderer, scene, camera } = stage;
      const world = createHeroWorld();
      worldRef.current = world;
      laidOutFor.current = ""; // a new world (Strict Mode mounts twice in dev) must be laid out again
      if (process.env.NODE_ENV !== "production") (window as unknown as { __hero?: unknown }).__hero = { world, camera };
      scene.add(world.root);
      scene.add(camera); // the camera carries the close atoms and the lens light
      camera.add(world.cameraRig);
      onFacts?.(world.facts);
      // dev-only switches for profiling: ?perf=nomsaa,noshadow,nodof,nodistant
      const flags = process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search).get("perf") ?? "" : "";
      if (flags.includes("noshadow")) renderer.shadowMap.enabled = false;
      if (flags.includes("nodistant")) world.root.children.forEach((c) => c.userData.isDistant && (c.visible = false));
      if (!flags.includes("nodof")) dofRef.current = createDof(renderer, flags.includes("msaa2") ? 2 : flags.includes("msaa4") ? 4 : 0);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.38;

      const c0 = cameraAt(world.keys, 0);
      camera.position.set(...c0.pos);
      camera.lookAt(new THREE.Vector3(...c0.look));
      camera.far = 260;
      camera.updateProjectionMatrix();

      return () => {
        camera.remove(world.cameraRig);
        dofRef.current?.dispose();
        dofRef.current = null;
        envRT.dispose();
        pmrem.dispose();
        world.dispose();
        worldRef.current = null;
      };
    },
    onResize: (w, h) => dofRef.current?.resize(w, h),
    render: ({ scene, camera, renderer }) => {
      const dof = dofRef.current;
      if (dof) dof.render(scene, camera, focusRef.current, bus.reducedMotion ? 0.4 : 1);
      else renderer.render(scene, camera);
    },
    frame: ({ camera, size, scene }, t, dt) => {
      const world = worldRef.current;
      if (!world) return;
      const T = tmp.current;

      // the opening waits for the loader (the scene still renders, so shaders are warm)
      if (!bus.ready) startRef.current = null;
      else if (startRef.current === null) startRef.current = t;
      const introT = startRef.current === null ? 0 : t - startRef.current;

      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5);
      bus.mouseX += (bus.mouseTX - bus.mouseX) * k;
      bus.mouseY += (bus.mouseTY - bus.mouseY) * k;
      bus.ctaHover += (bus.ctaHoverTarget - bus.ctaHover) * k;
      bus.intro = !bus.ready ? 0 : bus.reducedMotion ? 1 : introEase(introT);

      const p = bus.progress;
      const { width, height } = size();
      const aspect = width / height;

      // haze lifts as the opening begins
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = FOG_DENSITY * (1 + (1 - bus.intro) * 2.4);

      // --- lay the headline out once for this screen shape (as seen from the start of the journey) ---
      const layoutKey = `${width}x${height}`;
      if (laidOutFor.current !== layoutKey) {
        laidOutFor.current = layoutKey;
        const c0 = cameraAt(world.keys, 0);
        const cam0 = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 260);
        cam0.position.set(...c0.pos);
        cam0.lookAt(new THREE.Vector3(...c0.look));
        cam0.setViewOffset(width, height, -shiftAt(0) * width, 0, width, height);
        cam0.updateMatrixWorld(true);
        world.headline.layout(cam0);
        world.placeBrand(aspect);
      }

      // --- the camera: keys are in the molecule's frame; carry them into the world ---------------------
      world.scaffold.group.updateMatrixWorld(true);
      const m = world.scaffold.group.matrixWorld;
      const cam = cameraAt(world.keys, p);
      const back = 1 + Math.max(0, 1.55 - aspect) * 0.6; // narrower window: pull back
      const lookL = new THREE.Vector3(...cam.look);
      const posL = new THREE.Vector3(...cam.pos).sub(lookL).multiplyScalar(back).add(lookL);
      T.pos.copy(posL).applyMatrix4(m);
      T.look.copy(lookL).applyMatrix4(m);
      camera.position.copy(T.pos);
      camera.lookAt(T.look);

      // The last stretch never stops dead: the camera slowly orbits what it is looking at and creeps a
      // little nearer and farther, so the name sits in a living space.
      const settle = settleK(p);
      if (settle > 0) {
        const orbit = (Math.sin(t * 0.1) * 0.042 + Math.sin(t * 0.037 + 1) * 0.02) * settle;
        T.fwd.copy(camera.position).sub(T.look).applyAxisAngle(UP, orbit).add(T.look);
        camera.position.copy(T.fwd);
        camera.lookAt(T.look);
      }

      // physical offsets in camera space: pointer parallax, an idle drift so it lives before any input,
      // the opening's pull-back, and the last push forward when the way in is taken. Hovering the way in
      // already leans the camera forward: the system answers before it is asked.
      const calm = 1 - 0.55 * p - 0.25 * settle; // at the end the pointer still moves the world, but the name stays readable
      const life = 1 - 0.65 * p; // the idle drift thins as the camera closes in but never stops
      camera.translateX(bus.mouseX * 0.95 * calm + Math.sin(t * 0.21) * 0.32 * life);
      camera.translateY(-bus.mouseY * 0.6 * calm + Math.cos(t * 0.17) * 0.2 * life);
      camera.translateZ((1 - bus.intro) * 10 + Math.sin(t * 0.13) * 0.55 * (1 - p) + Math.sin(t * 0.09) * 0.42 * settle - bus.ctaHover * 1.6 * seg(p, 0.85, 0.97) - bus.enter * (14 + 10 * p));
      camera.fov = fovAt(BASE_FOV, bus.enter, p);
      camera.setViewOffset(width, height, -shiftAt(p) * width, 0, width, height);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      // focus follows what the camera is looking at
      camera.getWorldDirection(T.fwd);
      // ...and, as the name is earned, on the name itself: the structure behind it softens, the near atoms stay blurred
      const lookD = T.look.distanceTo(camera.position);
      const target = lookD + (BRAND_FOCUS - lookD) * brandAlpha(p);
      focusRef.current += (target - focusRef.current) * (1 - Math.exp(-dt * 3));

      // the pointer as a ray into the scene
      ndc.current.set(bus.mouseTX, -bus.mouseTY);
      raycaster.current.setFromCamera(ndc.current, camera);
      const pointerAway = bus.mouseTX === 0 && bus.mouseTY === 0 && bus.mouseX === 0;

      world.update({ t, dt, intro: bus.intro, introT, progress: p, ray: pointerAway ? null : raycaster.current.ray, cta: bus.ctaHover, camera });

      // which atom is the pointer over? only while the structure is the subject
      if (bus.intro > 0.7 && p < 0.86 && ++frameNo.current % 2 === 0) {
        const hit = pointerAway ? null : world.scaffold.pick(raycaster.current);
        if (hit !== bus.hover) {
          bus.hover = hit;
          world.scaffold.setHover(hit);
        }
      } else if (p >= 0.86 && bus.hover !== null) {
        bus.hover = null;
        world.scaffold.setHover(null);
      }

      // instrument readings: where the camera is in the structure's frame, how it has turned, what is nearest
      bus.cam.x = camera.position.x;
      bus.cam.y = camera.position.y;
      bus.cam.z = camera.position.z;
      T.inv.copy(m).invert();
      T.local.copy(camera.position).applyMatrix4(T.inv);
      bus.local.x = T.local.x;
      bus.local.y = T.local.y;
      bus.local.z = T.local.z;
      bus.rotY = THREE.MathUtils.radToDeg(world.scaffold.group.rotation.y);
      const near = nearestAtom(world.facts.layout.atoms as V3[], [T.local.x, T.local.y, T.local.z]);
      bus.nearest.index = near.index;
      bus.nearest.bl = near.dist / world.facts.layout.bondLength;
      bus.lookLocal.x = lookL.x;
      bus.lookLocal.y = lookL.y;
      bus.lookLocal.z = lookL.z;
      bus.rail = nearestAtom(world.facts.layout.path as V3[], [T.local.x, T.local.y, T.local.z]).index;

      // the identity's ink on screen: the descriptor and the way in hang from it
      if (p > 0.78) world.brand.anchor(camera, width, height, bus.brand);
      else bus.brand.visible = false;

      // pin screen positions for the annotation layer
      const project = (v: THREE.Vector3) => {
        v.project(camera);
        return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
      };
      if (p < 0.34) {
        bus.projected.center = project(world.scaffold.group.getWorldPosition(new THREE.Vector3()));
        world.facts.annotations.forEach((a, i) => {
          bus.projected[`a${i}`] = project(world.scaffold.atomWorld(a.atom));
        });
      }
      if (bus.hover !== null) bus.projected.hover = project(world.scaffold.atomWorld(bus.hover));
    },
  });

  if (failed) return null;
  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />;
}
