// Mirrors backend/mas/agents.py (ROSTER, STATUSES) and GET /api/agents.

/** Backend node ids. The backend may add agents; unknown ids are handled, not rejected. */
export type AgentId = string;

export const KNOWN_AGENT_IDS = [
  "planner",
  "research",
  "retro",
  "validator",
  "replanner",
  "critic",
  "evaluator",
] as const;
export type KnownAgentId = (typeof KNOWN_AGENT_IDS)[number];

/** backend/mas/agents.py STATUSES. */
export type AgentStatus =
  | "IDLE"
  | "QUEUED"
  | "PLANNING"
  | "WORKING"
  | "WAITING"
  | "COMMUNICATING"
  | "VALIDATING"
  | "CRITICIZING"
  | "COMPLETED"
  | "FAILED";

export const AGENT_STATUSES: readonly AgentStatus[] = [
  "IDLE",
  "QUEUED",
  "PLANNING",
  "WORKING",
  "WAITING",
  "COMMUNICATING",
  "VALIDATING",
  "CRITICIZING",
  "COMPLETED",
  "FAILED",
];

/** Where in the office a tool "lives" (docs/EVENTS.md). */
export type Station =
  | "command_desk"
  | "library"
  | "chemistry_workstation"
  | "validation_station"
  | "review_room"
  | "report_desk"
  | "workstation";

/** One row of GET /api/agents. */
export interface AgentSnapshot {
  id: AgentId;
  name: string;
  role: string;
  station: Station;
  status: AgentStatus;
  run_id: string | null;
  current_task: string | null;
  current_tool: string | null;
  updated_at: string | null;
}

/**
 * What the UI shows for an agent. Derived from status + active tool calls +
 * replan state (see lib/events/activity.ts) - never stored or invented.
 * "unknown" means the backend has not told us: offline, or no events yet.
 */
export type Activity =
  | "unknown"
  | "idle"
  | "queued"
  | "waiting"
  | "thinking"
  | "working"
  | "searching"
  | "communicating"
  | "validating"
  | "critiquing"
  | "replanning"
  | "completed"
  | "failed";
