// The hero's 3D world. One monumental molecule is the primary physical object; around it, real
// depth: extremely close atoms drifting past the lens, the headline set IN the scene between
// them, a midground of the structure itself, and distant molecules dissolving into haze.
// Warm key light with real shadows, a mineral rim from behind, copper fill from below, soft
// light shafts. No stars, no galaxy: this is a molecular atmosphere.
import * as THREE from "three";
import { annotations, describeAtom, molecularWeight, ringCount, type Annotation } from "@/lib/chem/analysis";
import { getMolecule } from "@/lib/chem/molecule";
import { formulaOf } from "@/lib/chem/smiles";
import { createMoleculeMesh, type MoleculeMesh } from "@/components/world/moleculeMesh";
import { arrivalK, brandAlpha, brandSolid, buildKeys, cameraAt, cross, norm, seg, smooth, sub, warmthAt, type CamKey, type V3 } from "./journey";
import { createScaffold, PALETTE, type Scaffold } from "./scaffold";
import { createBrand, createHeadline, type Brand, type Headline } from "./typeWorld";

/** Where the distant molecules settle when the name is revealed: behind it, around it, at different depths. (forward, right, up) from the arrival camera, in scene units. */
const ARRIVAL_SLOTS: { f: number; r: number; u: number }[] = [
  { f: 36, r: 16, u: 4.5 }, //     caffeine: right of the name, mid-depth
  { f: 56, r: -15, u: 13 }, //     aspirin: upper left, far
  { f: 46, r: 9, u: -12 }, //      ibuprofen: below the name's right end
  { f: 44, r: 22, u: -4 }, //      naphthalene: far right, low
  { f: 62, r: 28, u: 8 }, //       paracetamol: far right, high
  { f: 54, r: -27, u: -9 }, //     inositol: lower left, out of the way of the type
];

/** Cholesterol's constitution (no stereochemistry). The structure on screen is real; its layout is not a conformer. */
export const HERO_SMILES = "CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C";

/** Real molecules, far behind: a distant molecular atmosphere. */
const DISTANT = [
  "Cn1cnc2c1c(=O)n(C)c(=O)n2C", // caffeine
  "CC(=O)Oc1ccccc1C(=O)O", // aspirin
  "CC(C)Cc1ccc(cc1)C(C)C(=O)O", // ibuprofen
  "c1ccc2ccccc2c1", // naphthalene
  "CC(=O)Nc1ccc(O)cc1", // paracetamol
  "OC1C(O)C(O)C(O)C(O)C1O", // inositol
];

export interface HeroFacts {
  smiles: string;
  formula: string;
  weight: number | null;
  rings: number;
  heavyAtoms: number;
  annotations: Annotation[];
  atomInfo: (atom: number) => { title: string; detail: string } | null;
  /** For the instrument: atoms, bonds and the camera's rail, in the structure's own frame. */
  layout: { atoms: [number, number, number][]; bonds: [number, number][]; path: [number, number, number][]; bondLength: number };
}

export interface WorldFrame {
  t: number;
  dt: number;
  intro: number;
  /** seconds since the opening began */
  introT: number;
  progress: number;
  ray: THREE.Ray | null;
  cta: number;
  camera: THREE.PerspectiveCamera;
}

export interface HeroWorld {
  root: THREE.Group;
  /** Rides with the camera: extremely close atoms and the warm lens light. */
  cameraRig: THREE.Group;
  scaffold: Scaffold;
  headline: Headline;
  brand: Brand;
  keys: CamKey[];
  facts: HeroFacts;
  /** Set the identity for a screen of this aspect: off-centre, beyond the ring. */
  placeBrand: (aspect: number) => void;
  update: (f: WorldFrame) => void;
  dispose: () => void;
}

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

function softDisc(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.62, "rgba(255,255,255,0.32)");
  grd.addColorStop(0.9, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 96, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A tall soft-edged gradient: one light shaft. */
function shaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = "destination-in";
  const along = g.createLinearGradient(0, 0, 0, 256);
  along.addColorStop(0, "rgba(0,0,0,1)");
  along.addColorStop(0.7, "rgba(0,0,0,0.35)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = along;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHeroWorld(): HeroWorld {
  const res = getMolecule(HERO_SMILES);
  if (!res.ok) throw new Error(`hero molecule failed to parse: ${res.error}`);
  const mol = res.molecule;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const root = new THREE.Group();

  // --- light: warm key with real shadows, mineral rim from behind, copper fill from below ---
  const ambient = new THREE.AmbientLight(0xa89a80, 0.3);
  const key = new THREE.DirectionalLight(0xffe9c8, 2.1);
  key.position.set(9, 13, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 4;
  const rim = new THREE.PointLight(PALETTE.sage, 170, 80, 1.5);
  rim.position.set(-18, 8, -16);
  const fill = new THREE.PointLight(PALETTE.copper, 80, 60, 1.6);
  fill.position.set(12, -12, 9);
  root.add(ambient, key, rim, fill);

  // --- the molecule ------------------------------------------------------------------------
  const scaffold = createScaffold(mol);
  root.add(scaffold.group);

  // --- the headline, in the scene; the identity, inside the structure ---------------------------
  const headline = createHeadline();
  root.add(headline.group);
  const brand = createBrand();
  scaffold.group.add(brand.mesh);

  // --- distant molecules: real structures, far behind, dissolving into haze ------------------------
  const r = rng(21);
  const distant: { m: MoleculeMesh; spin: THREE.Vector3; home: THREE.Vector3; mats: { mat: THREE.MeshLambertMaterial; base: THREE.Color }[] }[] = [];
  DISTANT.forEach((smiles, i) => {
    const d = getMolecule(smiles);
    if (!d.ok) return;
    const m = createMoleculeMesh(d.molecule);
    track(m);
    const home = new THREE.Vector3((i % 2 ? 1 : -1) * (16 + r() * 22), (r() - 0.5) * 30, -26 - r() * 46);
    m.group.position.copy(home);
    m.group.scale.multiplyScalar(6 + r() * 4);
    m.group.rotation.set(r() * 6, r() * 6, r() * 6);
    m.group.userData.isDistant = true;
    // far and blurred: cheap Lambert shading is indistinguishable and much lighter than PBR
    const mats: { mat: THREE.MeshLambertMaterial; base: THREE.Color }[] = [];
    m.group.traverse((o) => {
      const mesh = o as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      const old = mesh.material as THREE.MeshStandardMaterial;
      const lam = new THREE.MeshLambertMaterial({ color: old.color });
      mesh.material = lam;
      mats.push({ mat: lam, base: old.color.clone() });
      old.dispose();
    });
    root.add(m.group);
    distant.push({ m, spin: new THREE.Vector3((r() - 0.5) * 0.05, (r() - 0.5) * 0.06, (r() - 0.5) * 0.03), home, mats });
  });

  // --- light shafts: a soft volume of warm light falling through the structure ---------------------
  const shaftTex = track(shaftTexture());
  const shaftMat = track(new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xf2c98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const shaftGeo = track(new THREE.PlaneGeometry(1, 1));
  [
    { x: 9, y: 4, z: -14, w: 10, h: 64, rot: -0.55 },
    { x: 2, y: 6, z: -22, w: 16, h: 72, rot: -0.5 },
    { x: 18, y: 0, z: -18, w: 8, h: 58, rot: -0.62 },
  ].forEach((s) => {
    const m = new THREE.Mesh(shaftGeo, shaftMat);
    m.position.set(s.x, s.y, s.z);
    m.scale.set(s.w, s.h, 1);
    m.rotation.z = s.rot;
    m.renderOrder = 1;
    root.add(m);
  });

  // --- dust: fine, sparse, warm-white ---------------------------------------------------------------
  const disc = track(softDisc());
  const scatter = (count: number, spread: [number, number, number, number], seed: number) => {
    const rr = rng(seed);
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (rr() - 0.5) * spread[0];
      a[i * 3 + 1] = (rr() - 0.5) * spread[1];
      a[i * 3 + 2] = spread[2] + rr() * spread[3];
    }
    return a;
  };
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(scatter(420, [80, 44, -50, 80], 5), 3));
  const dustMat = track(new THREE.PointsMaterial({ map: disc, size: 0.2, color: 0xe8e4d8, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  root.add(dust);

  // --- extremely close atoms: they ride with the lens, drift, and are heavily out of focus --------
  const cameraRig = new THREE.Group();
  const sphere = track(new THREE.SphereGeometry(1, 28, 20));
  const closeMat = (color: number) => track(new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.15 }));
  // Each has two lives: the opening (drifting near the lens) and the arrival (sweeping back in from off-screen
  // to rest across the edges of the frame: foreground, partly in view, heavily out of focus). `arr` is where it
  // settles as a point in normalised screen space, its depth ahead of the lens and its size (0 = does not return).
  const closeAtoms = [
    { color: PALETTE.stone, p: [-5.6, -3.4, -6.5], s: 1.05, ph: 0, arr: { x: -1.02, y: -0.96, d: 5.4, s: 1.05 } },
    { color: PALETTE.sage, p: [5.4, 3.0, -7.0], s: 0.95, ph: 2, arr: { x: 0.94, y: 0.86, d: 8.5, s: 1.05 } },
    { color: PALETTE.copper, p: [3.4, -3.3, -4.2], s: 0.62, ph: 4, arr: { x: -0.42, y: -1.06, d: 4.4, s: 0.42 } },
    { color: PALETTE.stone, p: [-3.6, 3.2, -8.5], s: 0.9, ph: 1, arr: { x: 0, y: 0, d: 8, s: 0 } },
  ].map((c) => {
    const m = new THREE.Mesh(sphere, closeMat(c.color));
    m.position.set(c.p[0], c.p[1], c.p[2]);
    m.scale.setScalar(c.s);
    cameraRig.add(m);
    return { m, home: m.position.clone(), s: c.s, ph: c.ph, arr: c.arr };
  });
  // a warm light that travels with the lens, so atoms passing close are lit as they arrive
  const lens = new THREE.PointLight(0xffe2b8, 30, 18, 1.8);
  lens.position.set(0.6, 0.5, -1.2);
  cameraRig.add(lens);

  const keys = buildKeys(scaffold.path, scaffold.radius, scaffold.atoms, scaffold.rings, scaffold.ringNormals);

  const facts: HeroFacts = {
    smiles: HERO_SMILES,
    formula: formulaOf(mol.graph),
    weight: molecularWeight(mol.graph),
    rings: ringCount(mol.graph),
    heavyAtoms: mol.graph.atoms.length,
    annotations: annotations(mol.graph),
    atomInfo: (atom) => describeAtom(mol.graph, atom),
    layout: { atoms: scaffold.atoms, bonds: scaffold.bonds, path: scaffold.path, bondLength: scaffold.bondLength },
  };

  // the arrival: where the camera ends, and the frame around it (forward / right / up)
  const end = cameraAt(keys, 1);
  const endPos = new THREE.Vector3(...end.pos);
  const endLook = new THREE.Vector3(...end.look);
  const fwdE = norm(sub(end.look, end.pos));
  const rightE = norm(cross(fwdE, [0, 1, 0] as V3));
  const upE = cross(rightE, fwdE);
  const slotLocal = ARRIVAL_SLOTS.map((s) => new THREE.Vector3(end.pos[0] + fwdE[0] * s.f + rightE[0] * s.r + upE[0] * s.u, end.pos[1] + fwdE[1] * s.f + rightE[1] * s.r + upE[1] * s.u, end.pos[2] + fwdE[2] * s.f + rightE[2] * s.r + upE[2] * s.u));
  const slotWorld = new THREE.Vector3();
  const tint = new THREE.Color();
  const KEY_COOL = new THREE.Color(0xffe9c8);
  const KEY_WARM = new THREE.Color(0xffd29a);
  const AMB_COOL = new THREE.Color(0xa89a80);
  const AMB_WARM = new THREE.Color(0xb59a76);
  const END_FOV = 38;

  return {
    root,
    cameraRig,
    scaffold,
    headline,
    brand,
    keys,
    facts,
    placeBrand(aspect) {
      // the name sits beyond the ring, left of centre and a touch high: the structure holds the right and the edges
      brand.place(endPos, endLook, END_FOV, 12, 0.165, -0.115, 0.035, aspect);
    },
    update({ t, dt, intro, introT, progress, ray, cta, camera }) {
      // Slow, physical motion: the whole structure drifts and turns a little. The camera rides in the
      // structure's own frame (ScaffoldScene), so it stays on its rail; everything else is fixed in the
      // world, so the turn reads as real parallax against the type, the distant molecules and the dust.
      scaffold.group.rotation.y = Math.sin(t * 0.13) * 0.16 + t * 0.004;
      scaffold.group.rotation.x = Math.sin(t * 0.09) * 0.05;
      scaffold.group.position.y = Math.sin(t * 0.31) * 0.22;
      scaffold.update(dt, t, ray, cta);

      headline.update({ introT, progress, camera, alpha: 1 });
      brand.update({ alpha: brandAlpha(progress) * intro, solid: brandSolid(progress), t, camera });

      // The distant molecules are the same ones from the opening; as the camera goes deeper they drift in
      // behind the name (each on its own schedule) and dim a little: the world evolves, it is not replaced.
      const arrive = arrivalK(progress);
      const dim = 1 - 0.28 * arrive;
      distant.forEach((d, i) => {
        d.m.group.rotation.x += d.spin.x * dt;
        d.m.group.rotation.y += d.spin.y * dt;
        d.m.group.rotation.z += d.spin.z * dt;
        const k = smooth(seg(progress, 0.5 + 0.02 * i, 0.94));
        const slot = slotLocal[i];
        if (slot && k > 0) {
          slotWorld.copy(slot).applyMatrix4(scaffold.group.matrixWorld);
          d.m.group.position.set(d.home.x + (slotWorld.x - d.home.x) * k, d.home.y + (slotWorld.y - d.home.y) * k, d.home.z + (slotWorld.z - d.home.z) * k);
          d.m.group.position.y += Math.sin(t * 0.2 + d.home.x) * 0.9;
        } else {
          d.m.group.position.y = d.home.y + Math.sin(t * 0.2 + d.home.x) * 0.9;
        }
        for (const { mat, base } of d.mats) mat.color.copy(base).multiplyScalar(dim);
      });
      dust.rotation.y = t * 0.005;

      // the close atoms drift and lose presence as the camera closes on the real structure
      const closeK = 1 - smooth(seg(progress, 0.12, 0.34));
      // ...and they sweep back in from beyond the frame as the name is earned, to rest across its edges
      const back = smooth(seg(progress, 0.74, 0.97));
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      closeAtoms.forEach((c) => {
        const drift = 0.5 * (1 - back);
        if (back > 0 && c.arr.s > 0) {
          const d = c.arr.d;
          const fx = c.arr.x * halfH * d * camera.aspect;
          const fy = c.arr.y * halfH * d;
          // from far outside the frame (2.6x) to its resting place, breathing very slowly once it has arrived
          const o = 1 + (1 - back) * 1.6;
          c.m.position.set(fx * o + Math.sin(t * 0.19 + c.ph) * 0.18, fy * o + Math.cos(t * 0.15 + c.ph) * 0.14, -d + Math.sin(t * 0.11 + c.ph) * 0.25);
          c.m.scale.setScalar(c.arr.s * intro);
          c.m.visible = intro > 0.01;
        } else {
          c.m.position.set(c.home.x + Math.sin(t * 0.21 + c.ph) * drift, c.home.y + Math.cos(t * 0.17 + c.ph) * 0.4 * drift * 2, c.home.z + Math.sin(t * 0.13 + c.ph) * 0.4);
          c.m.scale.setScalar(c.s * closeK * intro);
          c.m.visible = closeK * intro > 0.01;
        }
      });

      // arrival is warmer than the opening: the key turns amber, the mineral rim steps back, the haze glows
      const warm = warmthAt(progress);
      key.color.copy(KEY_COOL).lerp(KEY_WARM, warm);
      ambient.color.copy(AMB_COOL).lerp(AMB_WARM, warm);
      lens.color.copy(tint.set(0xffe2b8).lerp(KEY_WARM, warm));
      ambient.intensity = (0.3 + 0.06 * warm) * intro;
      key.intensity = (2.1 + 0.35 * warm) * intro;
      rim.intensity = (170 * (1 - 0.3 * warm) + 70 * cta) * intro;
      fill.intensity = (80 * (1 + 0.5 * warm) + 40 * cta) * intro;
      lens.intensity = (30 + 10 * warm) * intro;
      dustMat.opacity = 0.5 * (0.4 + 0.6 * intro);
      shaftMat.opacity = 0.05 * (1 + 0.8 * warm) * intro * (0.85 + 0.15 * Math.sin(t * 0.4));
    },
    dispose() {
      scaffold.dispose();
      headline.dispose();
      brand.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
