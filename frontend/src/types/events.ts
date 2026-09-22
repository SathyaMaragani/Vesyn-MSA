// The event contract. Source of truth: backend/mas/events.py (TYPES) and
// docs/EVENTS.md. Payload shapes were checked against the emitting code in
// backend/mas/{agents,gateway,graph}.py.
import type { AgentId, AgentStatus, Station } from "./agents";

export const EVENT_TYPES = [
  "AGENT_STATUS_CHANGED",
  "RUN_STARTED",
  "TASK_CREATED",
  "TASK_ASSIGNED",
  "TASK_STARTED",
  "TASK_COMPLETED",
  "TASK_FAILED",
  "TOOL_REQUESTED",
  "TOOL_STARTED",
  "TOOL_COMPLETED",
  "TOOL_FAILED",
  "MESSAGE_SENT",
  "MOLECULE_RECEIVED",
  "ROUTE_GENERATED",
  "VALIDATION_STARTED",
  "VALIDATION_COMPLETED",
  "CRITIQUE_CREATED",
  "REPLAN_STARTED",
  "REPLAN_COMPLETED",
  "PROJECT_COMPLETED",
  "PROJECT_FAILED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** What a run was asked to do (backend/mas/intent.py TASKS). Only retrosynthesis produces routes. */
export type Task = "retrosynthesis" | "profile" | "properties" | "solubility" | "analogues";

/** A run finished without a route when routes were the point: absent task = a run from before prompts. */
export const missedRoute = (d: { recommended_route_id: number | null; task?: Task }) =>
  d.recommended_route_id === null && (d.task ?? "retrosynthesis") === "retrosynthesis";

export interface SearchBudget {
  attempt?: number;
  iteration_limit: number;
  top_n: number;
}

export type Scalar = string | number | boolean | null;
export type Severity = "high" | "medium" | "low" | "info";
export type AssessmentSummary =
  | "STRONGLY_SUPPORTED"
  | "SUPPORTED"
  | "INSUFFICIENT_EVIDENCE"
  | "REVIEW_REQUIRED";

/** `data` payload per event type. Fields the backend documents as optional are optional. */
export interface EventDataMap {
  RUN_STARTED: { project_id: string; query: string; params: { top_n: number; iteration_limit: number } };
  AGENT_STATUS_CHANGED: { status: AgentStatus; current_task: string | null; station: Station };
  TASK_CREATED: { title: string; attempt: number };
  TASK_ASSIGNED: { title: string; assignee: AgentId };
  TASK_STARTED: Record<string, never>;
  TASK_COMPLETED: { output: Record<string, unknown> };
  TASK_FAILED: { error: string };
  TOOL_REQUESTED: { call_id: string; tool: string; reason: string; input: Record<string, Scalar> };
  TOOL_STARTED: {
    call_id: string;
    tool: string;
    version: string;
    station: Station;
    input: Record<string, Scalar>;
  };
  TOOL_COMPLETED: {
    call_id: string;
    tool: string;
    version: string;
    duration_ms: number;
    summary: Record<string, unknown>;
  };
  TOOL_FAILED: {
    call_id: string;
    tool: string;
    status: "DENIED" | "FAILED";
    error: string;
    duration_ms?: number;
  };
  MESSAGE_SENT: { to: AgentId; text: string };
  /** task / prompt: what the Orchestrator read from the request (absent on runs from before prompts). */
  MOLECULE_RECEIVED: { smiles: string; query: string; name: string | null; source: "smiles" | "chembl" | "pubchem"; task?: Task; prompt?: string };
  ROUTE_GENERATED: { route_id: number; attempt: number; steps: number; state_score: number | null };
  VALIDATION_STARTED: { route_id: number; attempt: number; steps: number };
  VALIDATION_COMPLETED: {
    route_id: number;
    attempt: number;
    assessment: AssessmentSummary;
    label: string;
    signals: Record<string, unknown>;
  };
  CRITIQUE_CREATED: {
    route_id: number;
    counts: Partial<Record<Severity, number>>;
    headline: string;
    strengths: string[];
  };
  REPLAN_STARTED: { reason: string; previous: SearchBudget; next: SearchBudget };
  REPLAN_COMPLETED: { next: SearchBudget };
  PROJECT_COMPLETED: {
    project_id: string;
    task?: Task;
    recommended_route_id: number | null;
    recommendation: string;
    routes: number;
  };
  PROJECT_FAILED: { project_id: string; error: string };
}

export interface EventOf<K extends EventType> {
  /** Global order (Postgres bigserial). Sort and dedupe by this. */
  seq: number;
  id: string;
  type: K;
  run_id: string | null;
  agent_id: AgentId | null;
  task_id: string | null;
  ts: string;
  data: EventDataMap[K];
}

export type NeoEvent = { [K in EventType]: EventOf<K> }[EventType];
