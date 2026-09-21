// TEST-ONLY event builders. Shapes follow what backend/mas/{agents,gateway,graph}.py
// emit (docs/EVENTS.md). These never ship in the app: the UI only ever folds events
// that came from the backend.
import type { EventDataMap, EventOf, EventType, NeoEvent } from "../src/types/events.ts";

let counter = 0;

export function ev<K extends EventType>(
  type: K,
  seq: number,
  data: EventDataMap[K],
  meta: { run?: string | null; agent?: string | null; task?: string | null } = {},
): NeoEvent {
  counter += 1;
  const e: EventOf<K> = {
    seq,
    id: `ev_${counter}`,
    type,
    run_id: meta.run === undefined ? "run_a" : meta.run,
    agent_id: meta.agent ?? null,
    task_id: meta.task ?? null,
    ts: `2026-09-21T00:00:${String(seq % 60).padStart(2, "0")}+00:00`,
    data,
  };
  return e as NeoEvent;
}

/** planner -> retro (with a widened second attempt) -> validator -> critic -> evaluator. */
export function sampleRun(): NeoEvent[] {
  const status = (seq: number, agent: string, s: EventDataMap["AGENT_STATUS_CHANGED"]["status"], task: string | null) =>
    ev("AGENT_STATUS_CHANGED", seq, { status: s, current_task: task, station: "command_desk" }, { agent });
  return [
    ev("RUN_STARTED", 1, { project_id: "proj_1", query: "aspirin", params: { top_n: 5, iteration_limit: 100 } }),
    ev("TASK_CREATED", 2, { title: "Plan the run", attempt: 1 }, { agent: "planner", task: "task_plan" }),
    ev("TASK_STARTED", 3, {}, { agent: "planner", task: "task_plan" }),
    status(4, "planner", "PLANNING", "task_plan"),
    ev("TOOL_REQUESTED", 5, { call_id: "tc_1", tool: "pubchem.resolve", reason: "resolve", input: { query: "aspirin" } }, { agent: "planner", task: "task_plan" }),
    ev("TOOL_STARTED", 6, { call_id: "tc_1", tool: "pubchem.resolve", version: "pug-rest", station: "command_desk", input: { query: "aspirin" } }, { agent: "planner", task: "task_plan" }),
    ev("TOOL_COMPLETED", 7, { call_id: "tc_1", tool: "pubchem.resolve", version: "pug-rest", duration_ms: 120, summary: { smiles: "CC(=O)Oc1ccccc1C(=O)O", source: "pubchem" } }, { agent: "planner", task: "task_plan" }),
    ev("MOLECULE_RECEIVED", 8, { smiles: "CC(=O)Oc1ccccc1C(=O)O", query: "aspirin", name: "Aspirin", source: "pubchem" }, { agent: "planner" }),
    ev("MESSAGE_SENT", 9, { to: "retro", text: "Find routes" }, { agent: "planner" }),
    ev("TASK_COMPLETED", 10, { output: { tasks_created: 7 } }, { agent: "planner", task: "task_plan" }),
    status(11, "planner", "COMPLETED", null),
    ev("ROUTE_GENERATED", 12, { route_id: 0, attempt: 1, steps: 1, state_score: 0.99 }, { agent: "retro" }),
    ev("VALIDATION_STARTED", 13, { route_id: 0, attempt: 1, steps: 1 }, { agent: "validator" }),
    ev("VALIDATION_COMPLETED", 14, { route_id: 0, attempt: 1, assessment: "REVIEW_REQUIRED", label: "Review required", signals: {} }, { agent: "validator" }),
    ev("REPLAN_STARTED", 15, { reason: "All 1 route(s) have at least one step flagged by validation.", previous: { attempt: 1, iteration_limit: 100, top_n: 5 }, next: { attempt: 2, iteration_limit: 250, top_n: 10 } }, { agent: "replanner" }),
    ev("REPLAN_COMPLETED", 16, { next: { attempt: 2, iteration_limit: 250, top_n: 10 } }, { agent: "replanner" }),
    ev("ROUTE_GENERATED", 17, { route_id: 0, attempt: 2, steps: 2, state_score: 0.8 }, { agent: "retro" }),
    ev("VALIDATION_COMPLETED", 18, { route_id: 0, attempt: 2, assessment: "SUPPORTED", label: "Supported", signals: {} }, { agent: "validator" }),
    ev("CRITIQUE_CREATED", 19, { route_id: 0, counts: { medium: 1 }, headline: "0 high, 1 medium, 0 low severity issue(s)", strengths: ["Short route (2 steps)."] }, { agent: "critic" }),
    ev("PROJECT_COMPLETED", 20, { project_id: "proj_1", recommended_route_id: 0, recommendation: "Route 0: 2 step(s), supported, score 0.71.", routes: 1 }),
  ];
}
