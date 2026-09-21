// Node/edge layout for drawing a synthesis route as a tree, left to right:
//   target -> reaction -> precursors -> reaction -> ...
// Step numbers are assigned pre-order, exactly like the backend's iter_steps, so
// "step 2" here is "step 2" in the critique and in the audit record.
import type { RouteNode, RouteReaction } from "../../types/routes.ts";

export const MOL_W = 152;
export const MOL_H = 128;
export const RXN_W = 46;
export const GAP = 34;
export const ROW_GAP = 14;
export const COL = MOL_W + RXN_W + GAP * 2;

export interface GraphMol {
  id: string;
  smiles: string;
  inStock: boolean;
  leaf: boolean;
  isTarget: boolean;
  /** top-left x; y is the vertical centre */
  x: number;
  y: number;
}

export interface GraphRxn {
  id: string;
  step: number;
  reaction: RouteReaction;
  /** left x; y is the vertical centre */
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface RouteLayout {
  mols: GraphMol[];
  rxns: GraphRxn[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function layoutRoute(tree: RouteNode): RouteLayout {
  const mols: GraphMol[] = [];
  const rxns: GraphRxn[] = [];
  const edges: GraphEdge[] = [];
  let leafRow = 0;
  let stepCounter = 0;

  const visit = (node: RouteNode, depth: number): number => {
    const id = `m${mols.length}`;
    const mol: GraphMol = {
      id,
      smiles: node.molecule_smiles,
      inStock: !!node.is_stock_available,
      leaf: !node.reactions || node.reactions.length === 0,
      isTarget: depth === 0,
      x: depth * COL,
      y: 0,
    };
    mols.push(mol);
    if (mol.leaf) {
      mol.y = leafRow * (MOL_H + ROW_GAP) + MOL_H / 2;
      leafRow += 1;
      return mol.y;
    }
    const ys: number[] = [];
    for (const r of node.reactions) {
      const step = ++stepCounter;
      const rx: GraphRxn = { id: `r${step}`, step, reaction: r, x: mol.x + MOL_W + GAP, y: 0 };
      rxns.push(rx);
      edges.push({ from: mol.id, to: rx.id });
      const childYs: number[] = [];
      for (const child of r.reactants ?? []) {
        const childId = `m${mols.length}`;
        childYs.push(visit(child, depth + 1));
        edges.push({ from: rx.id, to: childId });
      }
      rx.y = childYs.length ? mean(childYs) : mol.y;
      ys.push(rx.y);
    }
    mol.y = mean(ys);
    return mol.y;
  };
  visit(tree, 0);

  const width = Math.max(...mols.map((m) => m.x + MOL_W), MOL_W);
  const height = Math.max(leafRow, 1) * (MOL_H + ROW_GAP) - ROW_GAP;
  return { mols, rxns, edges, width, height };
}
