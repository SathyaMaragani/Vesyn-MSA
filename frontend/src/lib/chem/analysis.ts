// Facts read off a parsed molecular graph. Everything here is derived from the
// graph itself (no lookup tables of "known" molecules), so the hero's labels are
// true for whatever molecule it is showing.
import type { MolGraph } from "./smiles.ts";

/** Standard atomic weights (g/mol). */
const MASS: Record<string, number> = {
  H: 1.008,
  B: 10.81,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  Br: 79.904,
  I: 126.904,
};

/** Molecular weight, or null if the graph holds an element we have no weight for. */
export function molecularWeight(g: MolGraph): number | null {
  let total = 0;
  for (const a of g.atoms) {
    const m = MASS[a.element];
    if (m === undefined) return null;
    total += m + a.hydrogens * MASS.H;
  }
  return Math.round(total * 100) / 100;
}

/** Number of independent rings (cyclomatic number): bonds - atoms + fragments. */
export function ringCount(g: MolGraph): number {
  return g.bonds.length - g.atoms.length + g.components;
}

/**
 * The emptiest point of a flat drawing: the spot farthest from every atom, i.e.
 * the middle of a ring. A camera can pass through the molecule there without
 * hitting an atom.
 */
export function findHole(pos2: ArrayLike<number>, atomCount: number, steps = 60): { x: number; y: number; clearance: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < atomCount; i++) {
    minX = Math.min(minX, pos2[i * 2]);
    maxX = Math.max(maxX, pos2[i * 2]);
    minY = Math.min(minY, pos2[i * 2 + 1]);
    maxY = Math.max(maxY, pos2[i * 2 + 1]);
  }
  let best = { x: 0, y: 0, clearance: -1 };
  for (let gy = 0; gy <= steps; gy++) {
    for (let gx = 0; gx <= steps; gx++) {
      const x = minX + ((maxX - minX) * gx) / steps;
      const y = minY + ((maxY - minY) * gy) / steps;
      let nearest = Infinity;
      for (let i = 0; i < atomCount; i++) nearest = Math.min(nearest, Math.hypot(x - pos2[i * 2], y - pos2[i * 2 + 1]));
      if (nearest > best.clearance) best = { x, y, clearance: nearest };
    }
  }
  return best;
}

export interface AtomTag {
  atom: number;
  text: string;
}

/** A few true, checkable observations about the molecule, each pinned to an atom. */
export function atomTags(g: MolGraph): AtomTag[] {
  const tags: AtomTag[] = [];
  const doubleO = g.atoms.find((a) => a.element === "O" && g.bonds.some((b) => b.order === 2 && (b.a === a.index || b.b === a.index)));
  if (doubleO) tags.push({ atom: doubleO.index, text: "C=O  CARBONYL" });
  const ringN = g.atoms.find((a) => a.element === "N" && a.aromatic);
  if (ringN) tags.push({ atom: ringN.index, text: "N  AROMATIC" });
  const methyl = g.atoms.find(
    (a) => a.element === "C" && !a.aromatic && g.bonds.filter((b) => b.a === a.index || b.b === a.index).length === 1 && a.hydrogens === 3,
  );
  if (methyl) tags.push({ atom: methyl.index, text: "CH3  METHYL" });
  return tags;
}

/**
 * What the graph says about one atom, for the hover readout: element, its number
 * (1-based, as drawn), how many heavy-atom bonds it has, its hydrogens and whether
 * it is aromatic. Nothing here is inferred beyond the parsed graph.
 */
export function describeAtom(g: MolGraph, atom: number): { title: string; detail: string } | null {
  const a = g.atoms[atom];
  if (!a) return null;
  const bonds = g.bonds.filter((b) => b.a === atom || b.b === atom);
  const doubleBonds = bonds.filter((b) => b.order === 2).length;
  const parts = [`${bonds.length} BOND${bonds.length === 1 ? "" : "S"}`, `${a.hydrogens}H`];
  if (a.aromatic) parts.push("AROMATIC");
  else if (doubleBonds > 0) parts.push("DOUBLE BOND");
  return { title: `${a.element} ${atom + 1}`, detail: parts.join(" · ") };
}

/** Atoms that sit on a ring: an atom is in a ring iff one of its bonds is not a bridge (removing it leaves the ends connected). */
export function ringAtoms(g: MolGraph): Set<number> {
  const out = new Set<number>();
  const adj: number[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, i) => {
    adj[b.a].push(i);
    adj[b.b].push(i);
  });
  const connectedWithout = (skip: number, from: number, to: number): boolean => {
    const seen = new Set<number>([from]);
    const stack = [from];
    while (stack.length) {
      const u = stack.pop() as number;
      if (u === to) return true;
      for (const bi of adj[u]) {
        if (bi === skip) continue;
        const b = g.bonds[bi];
        const v = b.a === u ? b.b : b.a;
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    return false;
  };
  g.bonds.forEach((b, i) => {
    if (connectedWithout(i, b.a, b.b)) {
      out.add(b.a);
      out.add(b.b);
    }
  });
  return out;
}

/**
 * The longest shortest-path across the molecule (two BFS sweeps): an end-to-end walk
 * along real bonds. The hero camera travels along it.
 */
export function longestPath(g: MolGraph): number[] {
  const n = g.atoms.length;
  if (n === 0) return [];
  const nb: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) {
    nb[b.a].push(b.b);
    nb[b.b].push(b.a);
  }
  const bfs = (src: number) => {
    const prev = new Array<number>(n).fill(-2);
    const dist = new Array<number>(n).fill(-1);
    prev[src] = -1;
    dist[src] = 0;
    const q = [src];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of nb[u]) {
        if (dist[v] < 0) {
          dist[v] = dist[u] + 1;
          prev[v] = u;
          q.push(v);
        }
      }
    }
    let far = src;
    for (let i = 0; i < n; i++) if (dist[i] > dist[far]) far = i;
    return { far, prev };
  };
  const a = bfs(0).far;
  const { far: b, prev } = bfs(a);
  const path: number[] = [];
  for (let v = b; v !== -1 && v !== -2; v = prev[v]) path.push(v);
  return path.reverse();
}

export interface Annotation {
  atom: number;
  text: string;
}

/** Up to four real features of the graph worth pointing at (hydroxyl, alkene, quaternary carbon, methyl). */
export function annotations(g: MolGraph): Annotation[] {
  const out: Annotation[] = [];
  const bondsOf = (i: number) => g.bonds.filter((b) => b.a === i || b.b === i);
  const oh = g.atoms.find((a) => a.element === "O" && a.hydrogens === 1 && bondsOf(a.index).length === 1);
  if (oh) out.push({ atom: oh.index, text: "HYDROXYL  O–H" });
  const dbl = g.bonds.find((b) => b.order === 2 && g.atoms[b.a].element === "C" && g.atoms[b.b].element === "C");
  if (dbl) out.push({ atom: dbl.a, text: "ALKENE  C=C" });
  const quat = g.atoms.find((a) => a.element === "C" && a.hydrogens === 0 && bondsOf(a.index).length === 4);
  if (quat) out.push({ atom: quat.index, text: "QUATERNARY  C" });
  const carbonyl = g.atoms.find((a) => a.element === "O" && bondsOf(a.index).some((b) => b.order === 2));
  if (carbonyl) out.push({ atom: carbonyl.index, text: "CARBONYL  C=O" });
  const methyl = g.atoms.find((a) => a.element === "C" && !a.aromatic && a.hydrogens === 3 && bondsOf(a.index).length === 1);
  if (methyl && out.length < 4) out.push({ atom: methyl.index, text: "METHYL  CH3" });
  return out.slice(0, 4);
}

/**
 * The smallest rings of the molecule, each as its atom indices in bonded order. For every ring bond,
 * the shortest path between its ends that avoids that bond closes the smallest ring through it;
 * duplicates collapse. Rings larger than `maxSize` (envelopes around fused systems) are ignored.
 */
export function smallRings(g: MolGraph, maxSize = 7): number[][] {
  const nb: { to: number; bond: number }[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, i) => {
    nb[b.a].push({ to: b.b, bond: i });
    nb[b.b].push({ to: b.a, bond: i });
  });
  const seen = new Set<string>();
  const rings: number[][] = [];
  g.bonds.forEach((b, skip) => {
    const prev = new Map<number, number>([[b.a, -1]]);
    const q = [b.a];
    for (let h = 0; h < q.length && !prev.has(b.b); h++) {
      const u = q[h];
      for (const e of nb[u]) {
        if (e.bond === skip || prev.has(e.to)) continue;
        prev.set(e.to, u);
        q.push(e.to);
      }
    }
    if (!prev.has(b.b)) return; // a bridge: no ring through this bond
    const path: number[] = [];
    for (let v = b.b; v !== -1; v = prev.get(v) as number) path.push(v);
    if (path.length > maxSize) return;
    const key = [...path].sort((x, y) => x - y).join(",");
    if (seen.has(key)) return;
    seen.add(key);
    rings.push(path.reverse());
  });
  return rings;
}
