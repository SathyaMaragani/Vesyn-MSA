// Flattens a route tree into its reaction steps, in the SAME order and numbering
// as the backend's iter_steps (backend/mas/tools.py): pre-order, 1-based. The
// critique's `step` numbers refer to this numbering.
import type { RouteNode, RouteReaction } from "../../types/routes.ts";

export interface StepView {
  /** 1-based, matches CritiqueIssue.step. */
  index: number;
  depth: number;
  product: string;
  reaction: RouteReaction;
}

export function flattenSteps(tree: RouteNode): StepView[] {
  const out: StepView[] = [];
  const walk = (node: RouteNode, depth: number) => {
    for (const reaction of node.reactions ?? []) {
      out.push({ index: out.length + 1, depth, product: node.molecule_smiles, reaction });
      for (const child of reaction.reactants ?? []) walk(child, depth + 1);
    }
  };
  walk(tree, 0);
  return out;
}

/** Leaf molecules (starting materials) of a route tree. */
export function leafMolecules(tree: RouteNode): { smiles: string; inStock: boolean }[] {
  const out: { smiles: string; inStock: boolean }[] = [];
  const walk = (node: RouteNode) => {
    if (!node.reactions || node.reactions.length === 0) out.push({ smiles: node.molecule_smiles, inStock: !!node.is_stock_available });
    for (const r of node.reactions ?? []) for (const c of r.reactants ?? []) walk(c);
  };
  walk(tree);
  return out;
}
