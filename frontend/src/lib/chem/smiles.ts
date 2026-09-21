// A small SMILES parser: the atoms and bonds of the molecular graph a SMILES
// string denotes. It exists so the UI can draw the REAL molecule the backend
// named, with no coordinates invented - the graph is exactly what the string says.
// Hydrogens are implicit (counted, not drawn); stereo marks are ignored.
// Anything it cannot parse throws SmilesError and the UI says so.

export class SmilesError extends Error {}

export interface Atom {
  index: number;
  element: string;
  aromatic: boolean;
  charge: number;
  /** Hydrogens: explicit in a [bracket atom], else computed from normal valence. */
  hydrogens: number;
  /** true when hydrogens came from valence rules rather than the string. */
  hydrogensImplicit: boolean;
}

export interface Bond {
  a: number;
  b: number;
  /** 1.5 = aromatic. */
  order: 1 | 1.5 | 2 | 3;
}

export interface MolGraph {
  atoms: Atom[];
  bonds: Bond[];
  /** Disconnected fragments ("." in the SMILES). */
  components: number;
}

const ORGANIC = new Set(["B", "C", "N", "O", "P", "S", "F", "I"]);
const AROMATIC = new Set(["b", "c", "n", "o", "p", "s"]);
const VALENCES: Record<string, number[]> = {
  B: [3],
  C: [4],
  N: [3, 5],
  O: [2],
  P: [3, 5],
  S: [2, 4, 6],
  F: [1],
  Cl: [1],
  Br: [1],
  I: [1],
};

const BOND_CHARS: Record<string, 1 | 1.5 | 2 | 3> = { "-": 1, "=": 2, "#": 3, ":": 1.5, "/": 1, "\\": 1, $: 1 };

// isotope, symbol, chirality, hydrogens, charge, atom class
const BRACKET = /^(\d*)(\*|[A-Z][a-z]?|[a-z]{1,2})(@{0,2})(H\d*)?((?:\+\d+|-\d+|\++|-+)?)(?::\d+)?$/;

export function parseSmiles(input: string): MolGraph {
  const s = input.trim();
  if (!s) throw new SmilesError("empty SMILES");

  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const stack: number[] = [];
  const rings = new Map<number, { atom: number; order: Bond["order"] | null }>();
  let prev = -1;
  let pending: Bond["order"] | null = null;
  let i = 0;

  /** hydrogens === null means "compute from valence" (organic-subset atom). */
  const addAtom = (element: string, aromatic: boolean, charge: number, hydrogens: number | null): void => {
    const idx = atoms.length;
    atoms.push({ index: idx, element, aromatic, charge, hydrogens: hydrogens ?? 0, hydrogensImplicit: hydrogens === null });
    if (prev >= 0) {
      const order = pending ?? (aromatic && atoms[prev].aromatic ? 1.5 : 1);
      bonds.push({ a: prev, b: idx, order });
    }
    pending = null;
    prev = idx;
  };

  while (i < s.length) {
    const c = s[i];
    if (c === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) throw new SmilesError("unclosed [");
      const body = s.slice(i + 1, end);
      const m = BRACKET.exec(body);
      if (!m) throw new SmilesError(`cannot read atom [${body}]`);
      const sym = m[2];
      const aromatic = sym !== "*" && sym === sym.toLowerCase();
      const element = aromatic ? sym[0].toUpperCase() + sym.slice(1) : sym;
      let charge = 0;
      const ch = m[5];
      if (ch) {
        const sign = ch[0] === "+" ? 1 : -1;
        const digits = /^[+-](\d+)$/.exec(ch);
        charge = digits ? sign * Number(digits[1]) : sign * ch.length;
      }
      const hydrogens = m[4] ? (m[4] === "H" ? 1 : Number(m[4].slice(1))) : 0;
      addAtom(element, aromatic, charge, hydrogens);
      i = end + 1;
    } else if (c === "(") {
      if (prev < 0) throw new SmilesError("branch with no atom");
      stack.push(prev);
      i++;
    } else if (c === ")") {
      const top = stack.pop();
      if (top === undefined) throw new SmilesError("unmatched )");
      prev = top;
      pending = null;
      i++;
    } else if (c === ".") {
      prev = -1;
      pending = null;
      i++;
    } else if (c in BOND_CHARS) {
      pending = BOND_CHARS[c];
      i++;
    } else if (/\d/.test(c) || c === "%") {
      let label: number;
      if (c === "%") {
        const two = /^%(\d{2})/.exec(s.slice(i));
        if (!two) throw new SmilesError("bad %nn ring label");
        label = Number(two[1]);
        i += 3;
      } else {
        label = Number(c);
        i++;
      }
      if (prev < 0) throw new SmilesError("ring label with no atom");
      const open = rings.get(label);
      if (open) {
        if (open.atom === prev) throw new SmilesError("ring closes on itself");
        const order = pending ?? open.order ?? (atoms[prev].aromatic && atoms[open.atom].aromatic ? 1.5 : 1);
        bonds.push({ a: open.atom, b: prev, order });
        rings.delete(label);
      } else {
        rings.set(label, { atom: prev, order: pending });
      }
      pending = null;
    } else {
      const two = s.slice(i, i + 2);
      if (two === "Cl" || two === "Br") {
        addAtom(two, false, 0, null);
        i += 2;
      } else if (ORGANIC.has(c)) {
        addAtom(c, false, 0, null);
        i++;
      } else if (AROMATIC.has(c)) {
        addAtom(c.toUpperCase(), true, 0, null);
        i++;
      } else if (c === "*") {
        addAtom("*", false, 0, null);
        i++;
      } else {
        throw new SmilesError(`unexpected "${c}" at position ${i}`);
      }
    }
  }
  if (stack.length) throw new SmilesError("unclosed (");
  if (rings.size) throw new SmilesError(`unclosed ring label ${[...rings.keys()][0]}`);

  // implicit hydrogens for organic-subset atoms
  const orderSum = new Array<number>(atoms.length).fill(0);
  for (const b of bonds) {
    orderSum[b.a] += b.order;
    orderSum[b.b] += b.order;
  }
  const degree = new Array<number>(atoms.length).fill(0);
  for (const b of bonds) {
    degree[b.a] += 1;
    degree[b.b] += 1;
  }
  for (const a of atoms) {
    if (!a.hydrogensImplicit) continue;
    if (a.aromatic) {
      // aromatic carbon carries 3 - degree hydrogens; other aromatic atoms carry
      // none unless written as a bracket atom such as [nH]
      a.hydrogens = a.element === "C" ? Math.max(0, 3 - degree[a.index]) : 0;
      continue;
    }
    const valences = VALENCES[a.element];
    if (!valences) continue;
    const used = orderSum[a.index];
    const target = valences.find((v) => v >= used - 1e-9) ?? valences[valences.length - 1];
    a.hydrogens = Math.max(0, Math.floor(target - used + 1e-9));
  }

  const parent = atoms.map((_, k) => k);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const b of bonds) parent[find(b.a)] = find(b.b);
  const components = new Set(atoms.map((a) => find(a.index))).size;

  return { atoms, bonds, components };
}

/** Molecular formula from the graph (heavy atoms + counted hydrogens), Hill order. */
export function formulaOf(g: MolGraph): string {
  const counts = new Map<string, number>();
  let h = 0;
  for (const a of g.atoms) {
    counts.set(a.element, (counts.get(a.element) ?? 0) + 1);
    h += a.hydrogens;
  }
  if (h) counts.set("H", h);
  const order = ["C", "H", ...[...counts.keys()].filter((k) => k !== "C" && k !== "H").sort()];
  return order
    .filter((k) => counts.has(k))
    .map((k) => `${k}${counts.get(k) === 1 ? "" : counts.get(k)}`)
    .join("");
}

export function neighborsOf(g: MolGraph, atom: number): number[] {
  const out: number[] = [];
  for (const b of g.bonds) {
    if (b.a === atom) out.push(b.b);
    else if (b.b === atom) out.push(b.a);
  }
  return out;
}
