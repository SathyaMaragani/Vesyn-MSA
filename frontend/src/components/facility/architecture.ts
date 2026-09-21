// The building itself: floor, walkways between the core and each department, the perimeter shell and
// its entrance portal, structural columns, overhead trusses, ducts and working lights. All of it is static
// and goes into the shared batches; only the floor is its own mesh (it carries the tile texture).
import * as THREE from "three";
import { ZONE_LIST, facing } from "./layout";
import { C, floorTexture } from "./kit";
import type { BuildEnv } from "./zoneKit";

export const SHELL = { x: 50, zn: -42, zs: 50, h: 15 };

export function buildArchitecture(env: BuildEnv): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const tex = env.track(floorTexture());
  tex.repeat.set((SHELL.x * 2) / 8, (SHELL.zs - SHELL.zn) / 8);
  // polished stone: a little specular and environment reflection so light pools and glass read on it
  const floorMat = env.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.46, metalness: 0.05, envMapIntensity: 0.55 }));
  const floor = new THREE.Mesh(env.track(new THREE.PlaneGeometry(SHELL.x * 2, SHELL.zs - SHELL.zn)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, (SHELL.zs + SHELL.zn) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // walkways: a broad inlaid strip from the core to each department's open side, with edge lines and chevrons
  for (const z of ZONE_LIST) {
    if (z.id === "planner") continue;
    const [fx, fz] = facing(z); // toward the core; the walkway runs the other way
    const dist = Math.hypot(z.x, z.z);
    const r0 = 8.9;
    const r1 = dist - (z.d / 2 + 0.7);
    const len = r1 - r0;
    const ry = walkRy(fx, fz);
    const cx = (-fx * (r0 + r1)) / 2;
    const cz = (-fz * (r0 + r1)) / 2;
    env.matte.box(len, 0.03, 3.4, cx, 0.13, cz, 0x2f302a, ry);
    for (const s of [-1, 1]) env.emit.box(len, 0.02, 0.06, cx + fz * s * 1.75, 0.15, cz - fx * s * 1.75, 0x4d4c42, ry);
    for (let t = 0.1; t < 0.95; t += 0.14) {
      const px = -fx * (r0 + len * t);
      const pz = -fz * (r0 + len * t);
      env.emit.box(0.5, 0.02, 0.09, px, 0.15, pz, 0x5b5a4f, ry + 0.7);
      env.emit.box(0.5, 0.02, 0.09, px, 0.15, pz, 0x5b5a4f, ry - 0.7);
    }
  }
  // the plaza: a disc of pale polished stone around the core, with inlaid rings and a dial of fine ticks
  env.matte.cyl(17.9, 17.9, 0.05, 0, 0.04, 0, 0x3f403a, 120);
  env.matte.cyl(13.2, 13.2, 0.03, 0, 0.075, 0, 0x34352f, 96);
  env.matte.cyl(9.6, 9.6, 0.03, 0, 0.09, 0, 0x2b2c27, 80);
  for (const [r, col] of [[17.9, 0x6b6a5b], [13.2, 0x55544a], [9.6, 0x4a493f]] as [number, number][]) {
    const seg = Math.round(r * 7);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      env.emit.box(((r * Math.PI * 2) / seg) * 0.94, 0.02, 0.09, Math.cos(a) * r, 0.11, Math.sin(a) * r, col, -a - Math.PI / 2);
    }
  }
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const long = i % 5 === 0;
    const r0 = 17.9 - (long ? 0.7 : 0.35) / 2 - 0.4;
    env.emit.box(long ? 0.7 : 0.35, 0.02, 0.05, Math.cos(a) * r0, 0.11, Math.sin(a) * r0, 0x55544a, -a - Math.PI / 2 + Math.PI / 2);
  }

  // perimeter: a tall graphite north wall, glazed east and west walls, columns, and the south entrance portal
  env.matte.box(SHELL.x * 2, SHELL.h, 0.8, 0, SHELL.h / 2, SHELL.zn, 0x1b1c18);
  for (let x = -SHELL.x; x <= SHELL.x + 0.01; x += 8) env.metal.box(0.4, SHELL.h, 0.6, x, SHELL.h / 2, SHELL.zn + 0.6, C.metal);
  for (const sx of [-1, 1]) {
    env.glass.box(0.08, SHELL.h - 1.2, SHELL.zs - SHELL.zn, sx * SHELL.x, SHELL.h / 2 + 0.3, (SHELL.zs + SHELL.zn) / 2, C.glass);
    env.metal.box(0.5, 0.5, SHELL.zs - SHELL.zn, sx * SHELL.x, 0.25, (SHELL.zs + SHELL.zn) / 2, C.metal);
    env.metal.box(0.4, 0.4, SHELL.zs - SHELL.zn, sx * SHELL.x, SHELL.h, (SHELL.zs + SHELL.zn) / 2, C.brushed);
    for (let z = SHELL.zn; z <= SHELL.zs + 0.01; z += 12) env.metal.box(0.5, SHELL.h, 0.5, sx * SHELL.x, SHELL.h / 2, z, C.metal);
  }
  // south: a low parapet with the entrance portal at the middle
  for (const sx of [-1, 1]) {
    env.matte.box(SHELL.x - 7, 1.4, 0.6, sx * ((SHELL.x + 7) / 2), 0.7, SHELL.zs, 0x1b1c18);
    env.metal.box(0.9, 9, 0.9, sx * 6.2, 4.5, SHELL.zs, C.metal);
  }
  env.metal.box(13.6, 0.7, 1.0, 0, 9.2, SHELL.zs, C.brushed);
  env.emit.box(11, 0.06, 0.06, 0, 8.75, SHELL.zs + 0.1, 0x6f8a7a);

  // overhead: trusses, hung working lights and ducts (the lights are what the camera sees as scale)
  // (a cutaway: the trusses stand only along the perimeter, so the camera looks down into the building)
  for (const z of [SHELL.zn + 1.2, SHELL.zs - 1.2]) {
    env.metal.box(SHELL.x * 2, 0.5, 0.4, 0, 14.4, z, C.brushed);
    for (let x = -40; x <= 40; x += 16) {
      env.emit.box(6, 0.07, 0.36, x, 13.6, z + 1.0, 0x8f8672);
      env.metal.box(0.04, 0.8, 0.04, x - 2.6, 14.0, z + 1.0, C.metal);
      env.metal.box(0.04, 0.8, 0.04, x + 2.6, 14.0, z + 1.0, C.metal);
    }
  }
  for (const x of [-SHELL.x, SHELL.x]) env.metal.box(0.4, 0.5, SHELL.zs - SHELL.zn, x, 14.8, (SHELL.zs + SHELL.zn) / 2, C.metal);
  // ventilation ducts along the north wall and cable trays over the walkways
  env.metal.cyl(0.7, 0.7, SHELL.x * 2 - 4, 0, 12.6, SHELL.zn + 2.2, 0x37362f, 16, 0, 0, Math.PI / 2);
  env.metal.cyl(0.45, 0.45, SHELL.x * 2 - 4, 0, 11.6, SHELL.zn + 3.6, 0x37362f, 14, 0, 0, Math.PI / 2);
  for (let x = -42; x <= 42; x += 8) env.metal.box(0.16, 1.4, 0.16, x, 12.2, SHELL.zn + 2.2, C.metal);
  env.metal.box(SHELL.x * 2 - 4, 0.14, 0.7, 0, 12.0, SHELL.zn + 5.6, C.brushed);

  // the north wall's equipment: cabinets and racks along its foot, a long sample-storage counter
  for (let i = 0; i < 14; i++) {
    const x = -41 + i * 3.1;
    env.metal.box(2.6, 2.4, 0.9, x, 1.2, SHELL.zn + 1.2, i % 3 === 0 ? C.metal : C.brushed);
    env.matte.box(2.3, 2.0, 0.04, x, 1.25, SHELL.zn + 1.68, 0x12130f);
    env.emit.box(2.1, 0.03, 0.03, x, 2.28, SHELL.zn + 1.72, 0x4b6b5c);
  }
  for (const sx of [-1, 1]) {
    env.metal.box(1.2, 0.08, 18, sx * 46, 1.0, 22, C.steel);
    env.matte.box(1.1, 0.9, 17.8, sx * 46, 0.5, 22, 0x1f201c);
    for (let z = 14; z < 31; z += 2.2) {
      env.glass.cyl(0.12, 0.12, 0.34, sx * 46, 1.25, z, C.glass, 10);
      env.glass.box(0.34, 0.26, 0.34, sx * 46, 1.17, z + 0.9, C.glass);
    }
  }

  // structural columns between the departments
  for (const [x, z] of [[-44, -34], [44, -34], [-44, 42], [44, 42]]) {
    env.metal.cyl(0.42, 0.5, SHELL.h - 0.7, x, (SHELL.h - 0.7) / 2, z, C.metal, 16);
    env.metal.cyl(0.62, 0.62, 0.16, x, 0.08, z, C.brushed, 16);
    env.metal.cyl(0.62, 0.62, 0.16, x, SHELL.h - 0.7, z, C.brushed, 16);
  }

  return { group, dispose: () => undefined };
}

/** Rotation that turns a box's local x along the walkway that leads from the core to a department. */
function walkRy(fx: number, fz: number): number {
  // the walkway runs along (-fx, -fz); a box's local x maps to (cos ry, -sin ry)
  return Math.atan2(fz, -fx);
}
