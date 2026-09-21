// One place that turns a SMILES string into everything the UI draws.
import { extent, layout2D, layout3D } from "./layout.ts";
import { SmilesError, formulaOf, parseSmiles, type MolGraph } from "./smiles.ts";

export interface Molecule {
  smiles: string;
  graph: MolGraph;
  formula: string;
  /** flat [x,y,z,...] - a layout of the bond graph, not a conformer */
  pos3: Float32Array;
  /** flat [x,y,...] best-fit-plane depiction */
  pos2: Float32Array;
  radius: number;
}

export type MoleculeResult = { ok: true; molecule: Molecule } | { ok: false; smiles: string; error: string };

const cache = new Map<string, MoleculeResult>();
const CACHE_LIMIT = 200;

/** Parse + lay out once per SMILES. Never throws: an unreadable SMILES is a result the UI shows. */
export function getMolecule(smiles: string): MoleculeResult {
  const hit = cache.get(smiles);
  if (hit) return hit;
  let result: MoleculeResult;
  try {
    const graph = parseSmiles(smiles);
    const pos3 = layout3D(graph);
    result = { ok: true, molecule: { smiles, graph, formula: formulaOf(graph), pos3, pos2: layout2D(graph), radius: extent(pos3) } };
  } catch (err) {
    result = { ok: false, smiles, error: err instanceof SmilesError ? err.message : String(err) };
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(smiles, result);
  return result;
}

/** Muted CPK-style colours in the NEOchems palette (stone, amber, copper): readable on a dark ground, no neon. */
export const ELEMENT_HEX: Record<string, number> = {
  C: 0xc9c1a8,
  N: 0xd6a45b,
  O: 0xb87552,
  S: 0xe0b35a,
  P: 0xff9f5a,
  F: 0x7fd8b0,
  Cl: 0x6fcf97,
  Br: 0xc98a5e,
  I: 0xa88a6a,
  B: 0xe8b8a0,
  H: 0xe8e4d8,
};
export const ELEMENT_RADIUS: Record<string, number> = { C: 0.27, N: 0.29, O: 0.29, S: 0.36, P: 0.36, F: 0.25, Cl: 0.34, Br: 0.38, I: 0.42, B: 0.27 };

export const elementHex = (el: string): number => ELEMENT_HEX[el] ?? 0x9aabba;
export const elementCss = (el: string): string => `#${elementHex(el).toString(16).padStart(6, "0")}`;
