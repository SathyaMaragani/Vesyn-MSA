// The hero molecule as a physical object: an oversized ball-and-stick structure whose
// atoms are springs. The pointer pushes them aside like a hand through gel, and they
// settle back. The graph is the real parsed one; positions are a layout (not a conformer).
import * as THREE from "three";
import { longestPath, ringAtoms, smallRings } from "@/lib/chem/analysis";
import { ELEMENT_RADIUS, type Molecule } from "@/lib/chem/molecule";
import type { V3 } from "./journey";

/** The hero's materials, all from one palette: stone, sage, copper, amber, oxidised bronze. */
export const PALETTE = {
  stone: 0xc9c1a8,
  sage: 0x8faf9a,
  copper: 0xb87552,
  amber: 0xd6a45b,
  bronze: 0x9b7a5f,
  ground: 0x10110f,
};

const TARGET_RADIUS = 12; // scene units from the centre to the farthest atom

export interface Scaffold {
  group: THREE.Group;
  /** Half-extent in scene units. */
  radius: number;
  /** Every atom position at rest (scene units, centred). */
  atoms: V3[];
  /** Centres of the rings (scene units): the camera arrives inside one. */
  rings: V3[];
  /** Unit normal of each ring (same order as `rings`). */
  ringNormals: V3[];
  /** Bonds as atom index pairs, and the bond length in scene units (for "bond lengths" readouts). */
  bonds: [number, number][];
  bondLength: number;
  /** Atom positions (scene units, centred) along the molecule's longest bond path: the camera's rail. */
  path: V3[];
  /** World position of an atom right now. */
  atomWorld: (atom: number) => THREE.Vector3;
  pick: (ray: THREE.Raycaster) => number | null;
  setHover: (atom: number | null) => void;
  /** `ray` is in world space (or null when the pointer is away); `cta` 0..1 draws the structure taut. */
  update: (dt: number, t: number, ray: THREE.Ray | null, cta: number) => void;
  dispose: () => void;
}

interface Seg {
  a: number;
  b: number;
  off: number; // -1 | 0 | 1: parallel strand of a double bond
}

const colorOf = (el: string, ring: boolean): number => {
  if (el === "O") return PALETTE.copper;
  if (el === "N" || el === "S" || el === "P") return PALETTE.amber;
  return ring ? PALETTE.stone : PALETTE.sage;
};

/**
 * Rim light: a fresnel term added to the lit colour, so silhouettes catch a warm edge as if lit from
 * behind. Restrained on purpose - a physical highlight, not a glow.
 */
function withRim(mat: THREE.MeshStandardMaterial, color: number, intensity: number, power = 3): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color) };
    shader.uniforms.uRimK = { value: intensity };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimK;")
      .replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), ${power.toFixed(1)});
        outgoingLight += uRimColor * rimF * uRimK;
        #include <opaque_fragment>`,
      );
  };
}

export function createScaffold(mol: Molecule): Scaffold {
  const { graph } = mol;
  const n = graph.atoms.length;
  const ring = ringAtoms(graph);

  // centre the layout and scale it to a fixed size
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i++) c.add(new THREE.Vector3(mol.pos3[i * 3], mol.pos3[i * 3 + 1], mol.pos3[i * 3 + 2]));
  c.multiplyScalar(1 / Math.max(n, 1));
  let far = 0;
  for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(mol.pos3[i * 3] - c.x, mol.pos3[i * 3 + 1] - c.y, mol.pos3[i * 3 + 2] - c.z));
  const S = TARGET_RADIUS / Math.max(far, 1e-3);
  const base = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base[i * 3] = (mol.pos3[i * 3] - c.x) * S;
    base[i * 3 + 1] = (mol.pos3[i * 3 + 1] - c.y) * S;
    base[i * 3 + 2] = (mol.pos3[i * 3 + 2] - c.z) * S;
  }
  const off = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const cur = new Float32Array(n * 3);
  const phase = Float32Array.from({ length: n }, (_, i) => i * 2.399963);

  const segs: Seg[] = [];
  for (const b of graph.bonds) {
    if (b.order >= 2) {
      segs.push({ a: b.a, b: b.b, off: -1 }, { a: b.a, b: b.b, off: 1 });
    } else segs.push({ a: b.a, b: b.b, off: 0 });
  }

  const group = new THREE.Group();
  const sphereGeo = new THREE.SphereGeometry(1, 28, 20);
  const atomMat = new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.16 });
  withRim(atomMat, 0xe9c48a, 0.26, 4);
  const atoms = new THREE.InstancedMesh(sphereGeo, atomMat, n);
  atoms.frustumCulled = false;
  const radiusOf = graph.atoms.map((a) => (ELEMENT_RADIUS[a.element] ?? 0.3) * S * 1.05);
  const baseColor = graph.atoms.map((a) => new THREE.Color(colorOf(a.element, ring.has(a.index))));
  baseColor.forEach((col, i) => atoms.setColorAt(i, col));
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
  const bondMat = new THREE.MeshStandardMaterial({ color: PALETTE.bronze, roughness: 0.3, metalness: 0.78 });
  withRim(bondMat, 0xd6a45b, 0.2, 4);
  const bonds = new THREE.InstancedMesh(cylGeo, bondMat, segs.length);
  bonds.frustumCulled = false;
  atoms.castShadow = atoms.receiveShadow = true;
  bonds.castShadow = bonds.receiveShadow = true;
  group.add(bonds, atoms);

  const m4 = new THREE.Object3D();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const D = new THREE.Vector3();
  const P = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  let hovered: number | null = null;

  const writeMatrices = () => {
    for (let i = 0; i < n; i++) {
      m4.position.set(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2]);
      m4.quaternion.identity();
      m4.scale.setScalar(radiusOf[i] * (hovered === i ? 1.3 : 1));
      m4.updateMatrix();
      atoms.setMatrixAt(i, m4.matrix);
    }
    atoms.instanceMatrix.needsUpdate = true;
    segs.forEach((s, k) => {
      A.set(cur[s.a * 3], cur[s.a * 3 + 1], cur[s.a * 3 + 2]);
      B.set(cur[s.b * 3], cur[s.b * 3 + 1], cur[s.b * 3 + 2]);
      D.subVectors(B, A);
      const length = D.length();
      D.multiplyScalar(1 / (length || 1));
      m4.position.copy(A).add(B).multiplyScalar(0.5);
      if (s.off !== 0) {
        P.crossVectors(D, Z);
        if (P.lengthSq() < 1e-4) P.crossVectors(D, UP);
        m4.position.addScaledVector(P.normalize(), s.off * 0.12 * S);
      }
      m4.quaternion.setFromUnitVectors(UP, D);
      const r = (s.off === 0 ? 0.09 : 0.06) * S;
      m4.scale.set(r, length, r);
      m4.updateMatrix();
      bonds.setMatrixAt(k, m4.matrix);
    });
    bonds.instanceMatrix.needsUpdate = true;
  };

  for (let i = 0; i < n * 3; i++) cur[i] = base[i];
  writeMatrices();
  atoms.computeBoundingSphere();

  // the camera's rail: the molecule's own longest bond path
  const path: V3[] = longestPath(graph).map((i) => [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]] as V3);

  // ring centres: the camera arrives inside one of them
  const ringList = smallRings(graph).filter((r) => r.length >= 5);
  const ringCentres: V3[] = ringList.map((r) => {
    const c3: V3 = [0, 0, 0];
    for (const i of r) for (let a = 0; a < 3; a++) c3[a] += base[i * 3 + a] / r.length;
    return c3;
  });
  const ringNormalList: V3[] = ringList.map((r, k) => {
    // a ring's normal: the cross product of two spokes from its centre to its atoms
    const c3 = ringCentres[k];
    const a = r[0];
    const b = r[Math.floor(r.length / 3)];
    const u: V3 = [base[a * 3] - c3[0], base[a * 3 + 1] - c3[1], base[a * 3 + 2] - c3[2]];
    const v: V3 = [base[b * 3] - c3[0], base[b * 3 + 1] - c3[1], base[b * 3 + 2] - c3[2]];
    const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  });
  const bondPairs: [number, number][] = graph.bonds.map((b) => [b.a, b.b]);

  const inv = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const q = new THREE.Vector3();
  const v = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  const setHover = (atom: number | null) => {
    if (hovered !== null && hovered < n) atoms.setColorAt(hovered, baseColor[hovered]);
    hovered = atom;
    if (atom !== null && atom < n) atoms.setColorAt(atom, tmpColor.copy(baseColor[atom]).lerp(new THREE.Color(0xf4efe0), 0.55));
    if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
  };
  if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;

  return {
    group,
    radius: TARGET_RADIUS,
    rings: ringCentres,
    ringNormals: ringNormalList,
    bonds: bondPairs,
    bondLength: S,
    atoms: Array.from({ length: n }, (_, i) => [base[i * 3], base[i * 3 + 1], base[i * 3 + 2]] as V3),
    path,
    atomWorld: (atom) => new THREE.Vector3(cur[atom * 3], cur[atom * 3 + 1], cur[atom * 3 + 2]).applyMatrix4(group.matrixWorld),
    // Hover is decided from each atom's REST position, not where the physics has pushed it: the
    // pointer pushes atoms away from its own ray, so testing the displaced position would lose the
    // atom the moment you reached it (a feedback loop). The atom still visibly flexes; only the
    // question "is the pointer on it?" is answered from the stable position. Generous radius,
    // nearest along the ray wins.
    pick: (ray) => {
      group.updateMatrixWorld(true);
      inv.copy(group.matrixWorld).invert();
      localRay.copy(ray.ray).applyMatrix4(inv);
      let best: number | null = null;
      let bestT = Infinity;
      for (let i = 0; i < n; i++) {
        q.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).sub(localRay.origin);
        const along = q.dot(localRay.direction);
        if (along <= 0) continue;
        const perp = Math.sqrt(Math.max(0, q.lengthSq() - along * along));
        if (perp < radiusOf[i] * 2.4 && along < bestT) {
          bestT = along;
          best = i;
        }
      }
      return best;
    },
    setHover,
    update(dt, t, ray, cta) {
      const h = Math.min(dt, 0.05);
      group.updateMatrixWorld(true);
      if (ray) {
        inv.copy(group.matrixWorld).invert();
        localRay.copy(ray).applyMatrix4(inv);
      }
      const R = 3.4; // radius of the pointer's influence, scene units
      const pull = 1 - 0.07 * cta; // the structure draws taut when the way in is offered
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        // thermal shimmer: small, always on, a little livelier when the CTA is hovered
        const th = 0.045 * S * (1 + 2.2 * cta);
        const tx = Math.sin(t * 1.3 + phase[i]) * th;
        const ty = Math.cos(t * 1.1 + phase[i] * 1.7) * th;
        let fx = 0;
        let fy = 0;
        let fz = 0;
        if (ray) {
          q.set(base[ix] * pull + off[ix], base[ix + 1] * pull + off[ix + 1], base[ix + 2] * pull + off[ix + 2]);
          v.copy(q).sub(localRay.origin);
          const along = v.dot(localRay.direction);
          v.addScaledVector(localRay.direction, -along); // perpendicular from the ray to the atom
          const d = v.length();
          const w = Math.exp(-((d / R) * (d / R)));
          if (w > 0.002) {
            const k = (9 * w) / (d + 0.25);
            fx = v.x * k;
            fy = v.y * k;
            fz = v.z * k;
          }
        }
        for (let a = 0; a < 3; a++) {
          const f = a === 0 ? fx : a === 1 ? fy : fz;
          const acc = f - 15 * off[ix + a] - 4.6 * vel[ix + a];
          vel[ix + a] += acc * h;
          off[ix + a] += vel[ix + a] * h;
        }
        cur[ix] = base[ix] * pull + off[ix] + tx;
        cur[ix + 1] = base[ix + 1] * pull + off[ix + 1] + ty;
        cur[ix + 2] = base[ix + 2] * pull + off[ix + 2];
      }
      writeMatrices();
    },
    dispose() {
      sphereGeo.dispose();
      cylGeo.dispose();
      atomMat.dispose();
      bondMat.dispose();
      atoms.dispose();
      bonds.dispose();
    },
  };
}
