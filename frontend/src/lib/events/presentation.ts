// Presentation only: where each agent sits in the lab and what equipment its
// workstation carries. Names, roles, stations and every status come from the
// backend. Layout: agents ring the molecule core, left-to-right along the
// LangGraph flow (planner -> research/retro -> validator -> critic/evaluator),
// with the replanner beside retro (it loops back into it). The lab is entered
// from +z, so screen-right is +x.
import type { KnownAgentId } from "../../types/agents.ts";

export type Equipment = "holotable" | "library" | "reactor" | "scanner" | "review" | "loop" | "podium";

export interface AgentPresentation {
  /** [x, y, z] in the lab scene. */
  position: readonly [number, number, number];
  equipment: Equipment;
}

export const AGENT_PRESENTATION: Record<KnownAgentId, AgentPresentation> = {
  planner: { position: [-10, 0, 0], equipment: "holotable" },
  research: { position: [-5.7, 0, 6.1], equipment: "library" },
  retro: { position: [-5.7, 0, -6.1], equipment: "reactor" },
  validator: { position: [10, 0, 0], equipment: "scanner" },
  critic: { position: [7, 0, 5.3], equipment: "review" },
  evaluator: { position: [7, 0, -5.3], equipment: "podium" },
  replanner: { position: [0, 0, -7.8], equipment: "loop" },
};

/** The workflow order used by "follow workflow" and the cinematic power-up. */
export const WORKFLOW_ORDER: readonly KnownAgentId[] = [
  "planner",
  "research",
  "retro",
  "validator",
  "critic",
  "replanner",
  "evaluator",
];

export function presentationFor(id: string): AgentPresentation | null {
  return (AGENT_PRESENTATION as Record<string, AgentPresentation | undefined>)[id] ?? null;
}
