// Provenance. Source: backend/mas/gateway.py and db/init/04_mas.sql (mas.tool_calls).
import type { Station } from "./agents";

export type ToolCallStatus = "REQUESTED" | "COMPLETED" | "FAILED" | "DENIED";

/** One row of GET /api/audit (inputs and outputs are omitted from the list). */
export interface AuditEntry {
  id: string;
  run_id: string | null;
  task_id: string | null;
  agent_id: string;
  tool: string;
  tool_version: string | null;
  reason: string | null;
  status: ToolCallStatus;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

/** GET /api/audit/{call_id}: the full record, with input and output. */
export interface AuditCall extends AuditEntry {
  input: unknown;
  output: unknown;
}

/** GET /api/tools. */
export interface ToolInfo {
  name: string;
  version: string;
  description: string;
  allowed_agents: string[];
  station: Station;
}

/** GET /api/graph (LangGraph nodes and edges). */
export interface GraphDescription {
  nodes: { id: string; agent?: { id: string; name: string; role: string; station: Station } }[];
  edges: { source: string; target: string; conditional: boolean }[];
}
