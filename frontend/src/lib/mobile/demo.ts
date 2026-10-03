import type { RunResult } from "../../types/runs.ts";
import type { RouteNode } from "../../types/routes.ts";
import { lessonOf } from "./assistant.ts";

/** Route numbers can change between runs. Match the entire reaction tree instead. */
export function chemistryKey(node: RouteNode): string {
  return JSON.stringify([node.molecule_smiles, node.reactions.map((r) =>
    [r.reaction_smiles, r.reactants.map(chemistryKey).sort()]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

export function compareDemo(before: RunResult, after: RunResult) {
  const previous = before.ranked_routes.find((r) => r.route_id === before.recommended_route_id);
  const recommended = after.ranked_routes.find((r) => r.route_id === after.recommended_route_id);
  const changed = previous && after.ranked_routes.find((r) => chemistryKey(r.tree) === chemistryKey(previous.tree));
  if (!previous || !recommended || !changed) return null;
  return {
    previous: previous.score, changed: changed.score, recommended: recommended.score,
    steps: recommended.number_of_reactions,
    experiences: new Set(after.memory?.applied.filter((m) => m.simulated).map((m) => lessonOf(m.issue))).size,
  };
}
