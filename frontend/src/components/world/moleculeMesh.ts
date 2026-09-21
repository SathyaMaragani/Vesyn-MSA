// The target molecule as ball-and-stick in the lab: one InstancedMesh for atoms,
// one for bonds. The graph is the real one parsed from the backend's SMILES; the
// positions are a layout (see lib/chem/layout.ts).
import * as THREE from "three";
import { ELEMENT_RADIUS, elementHex, type Molecule } from "@/lib/chem/molecule";

export interface MoleculeMesh {
  group: THREE.Group;
  /** Atom index under the ray, or null. */
  pick: (raycaster: THREE.Raycaster) => number | null;
  /** Index (into graph.bonds) of the bond under the ray, or null. */
  pickBond: (raycaster: THREE.Raycaster) => number | null;
  setHighlight: (atom: number | null) => void;
  setBondHighlight: (bond: number | null) => void;
  dispose: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);

export function createMoleculeMesh(mol: Molecule): MoleculeMesh {
  const { graph, pos3 } = mol;
  const n = graph.atoms.length;
  const group = new THREE.Group();

  // Fit: real bond length is 1 unit; big molecules are scaled down to sit on the platform.
  const fit = mol.radius > 2.1 ? 2.1 / mol.radius : 1;
  group.scale.setScalar(fit);

  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const atomMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.25 });
  const atoms = new THREE.InstancedMesh(sphereGeo, atomMat, n);
  const m4 = new THREE.Object3D();
  const color = new THREE.Color();
  const baseColors: THREE.Color[] = [];
  const baseScale: number[] = [];
  graph.atoms.forEach((a, i) => {
    const r = ELEMENT_RADIUS[a.element] ?? 0.3;
    baseScale.push(r);
    m4.position.set(pos3[i * 3], pos3[i * 3 + 1], pos3[i * 3 + 2]);
    m4.scale.setScalar(r);
    m4.updateMatrix();
    atoms.setMatrixAt(i, m4.matrix);
    const c = new THREE.Color(elementHex(a.element));
    baseColors.push(c);
    atoms.setColorAt(i, c);
  });
  atoms.instanceMatrix.needsUpdate = true;
  if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
  atoms.frustumCulled = false;
  group.add(atoms);

  // bonds: order 1 -> one cylinder, 2 -> two, 3 -> three, aromatic -> one thick + one thin
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const bondMat = new THREE.MeshStandardMaterial({ color: 0x9b7a5f, roughness: 0.5, metalness: 0.3 });
  const parts: { a: number; b: number; offset: number; radius: number; bond: number }[] = [];
  graph.bonds.forEach((b, bi) => {
    if (b.order === 1) parts.push({ a: b.a, b: b.b, offset: 0, radius: 0.075, bond: bi });
    else if (b.order === 2) parts.push({ a: b.a, b: b.b, offset: -0.09, radius: 0.05, bond: bi }, { a: b.a, b: b.b, offset: 0.09, radius: 0.05, bond: bi });
    else if (b.order === 3) parts.push({ a: b.a, b: b.b, offset: 0, radius: 0.05, bond: bi }, { a: b.a, b: b.b, offset: -0.14, radius: 0.045, bond: bi }, { a: b.a, b: b.b, offset: 0.14, radius: 0.045, bond: bi });
    else parts.push({ a: b.a, b: b.b, offset: -0.07, radius: 0.06, bond: bi }, { a: b.a, b: b.b, offset: 0.09, radius: 0.028, bond: bi });
  });
  const bonds = new THREE.InstancedMesh(cylGeo, bondMat, Math.max(parts.length, 1));
  bonds.count = parts.length;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const placeBond = (k: number, grow = 1) => {
    const pt = parts[k];
    from.set(pos3[pt.a * 3], pos3[pt.a * 3 + 1], pos3[pt.a * 3 + 2]);
    to.set(pos3[pt.b * 3], pos3[pt.b * 3 + 1], pos3[pt.b * 3 + 2]);
    dir.subVectors(to, from);
    const len = dir.length() || 1e-6;
    dir.divideScalar(len);
    perp.crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    quat.setFromUnitVectors(UP, dir);
    m4.position.copy(from).add(to).multiplyScalar(0.5).addScaledVector(perp, pt.offset);
    m4.quaternion.copy(quat);
    m4.scale.set(pt.radius * grow, len, pt.radius * grow);
    m4.updateMatrix();
    bonds.setMatrixAt(k, m4.matrix);
  };
  parts.forEach((_, k) => placeBond(k));
  bonds.instanceMatrix.needsUpdate = true;
  bonds.frustumCulled = false;
  group.add(bonds);

  let litBond: number | null = null;
  const setBondHighlight = (bond: number | null) => {
    const bright = new THREE.Color(2.6, 2.4, 2.0);
    const plain = new THREE.Color(1, 1, 1);
    parts.forEach((pt, k) => {
      if (litBond !== null && pt.bond === litBond) {
        bonds.setColorAt(k, plain);
        placeBond(k);
      }
    });
    litBond = bond;
    if (bond !== null) {
      parts.forEach((pt, k) => {
        if (pt.bond === bond) {
          bonds.setColorAt(k, bright);
          placeBond(k, 1.9);
        }
      });
    }
    bonds.instanceMatrix.needsUpdate = true;
    if (bonds.instanceColor) bonds.instanceColor.needsUpdate = true;
  };

  let lit: number | null = null;
  const setHighlight = (atom: number | null) => {
    if (lit !== null && lit < n) {
      atoms.setColorAt(lit, baseColors[lit]);
      m4.position.set(pos3[lit * 3], pos3[lit * 3 + 1], pos3[lit * 3 + 2]);
      m4.quaternion.identity();
      m4.scale.setScalar(baseScale[lit]);
      m4.updateMatrix();
      atoms.setMatrixAt(lit, m4.matrix);
    }
    lit = atom;
    if (atom !== null && atom < n) {
      atoms.setColorAt(atom, color.set(0xffffff));
      m4.position.set(pos3[atom * 3], pos3[atom * 3 + 1], pos3[atom * 3 + 2]);
      m4.quaternion.identity();
      m4.scale.setScalar(baseScale[atom] * 1.35);
      m4.updateMatrix();
      atoms.setMatrixAt(atom, m4.matrix);
    }
    atoms.instanceMatrix.needsUpdate = true;
    if (atoms.instanceColor) atoms.instanceColor.needsUpdate = true;
  };

  return {
    group,
    pick: (raycaster) => {
      // instanced bounding spheres are not maintained; test against the group's own transform
      atoms.updateMatrixWorld(true);
      const hit = raycaster.intersectObject(atoms, false)[0];
      return hit && hit.instanceId !== undefined ? hit.instanceId : null;
    },
    pickBond: (raycaster) => {
      bonds.updateMatrixWorld(true);
      const hit = raycaster.intersectObject(bonds, false)[0];
      return hit && hit.instanceId !== undefined && parts[hit.instanceId] ? parts[hit.instanceId].bond : null;
    },
    setHighlight,
    setBondHighlight,
    dispose: () => {
      sphereGeo.dispose();
      cylGeo.dispose();
      atomMat.dispose();
      bondMat.dispose();
      atoms.dispose();
      bonds.dispose();
    },
  };
}
