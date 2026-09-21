// Turns what the backend reported into what the office shows. Presentation only:
// every input is a real status / tool call / replan flag from the fold.
import type { Activity, AgentStatus } from "../../types/agents.ts";

/** Tools whose work is retrieval, so an agent using them reads as "searching". */
export const SEARCH_TOOLS: ReadonlySet<string> = new Set([
  "pubchem.resolve",
  "aizynthfinder.plan",
  "chembl.similarity",
  "ord.evidence",
]);

export function deriveActivity(input: {
  status: AgentStatus | "UNKNOWN";
  agentId: string;
  activeTools: readonly string[];
  replanActive: boolean;
}): Activity {
  const { status, agentId, activeTools, replanActive } = input;
  switch (status) {
    case "UNKNOWN":
      return "unknown";
    case "FAILED":
      return "failed";
    case "COMPLETED":
      return "completed";
    case "IDLE":
      return "idle";
    case "QUEUED":
      return "queued";
    case "WAITING":
      return "waiting";
    case "COMMUNICATING":
      return "communicating";
    case "VALIDATING":
      return "validating";
    case "CRITICIZING":
      return "critiquing";
    case "PLANNING":
      return agentId === "replanner" || replanActive ? "replanning" : "thinking";
    case "WORKING":
      return activeTools.some((t) => SEARCH_TOOLS.has(t)) ? "searching" : "working";
  }
}

export type Tone = "dim" | "idle" | "run" | "warn" | "ok" | "bad";

export interface ActivityMeta {
  label: string;
  tone: Tone;
  /** three.js colour. Cyan = in progress, amber = scrutiny, green = done, red = failed. */
  hex: number;
  /** CSS colour. */
  css: string;
  /** Drives animation speed in the office (0 = still). */
  intensity: number;
}

export const ACTIVITY_META: Record<Activity, ActivityMeta> = {
  unknown: { label: "Unknown", tone: "dim", hex: 0x5a5647, css: "rgb(var(--nc-lo))", intensity: 0 },
  idle: { label: "Idle", tone: "idle", hex: 0x7a766a, css: "rgb(var(--nc-mid))", intensity: 0.1 },
  queued: { label: "Queued", tone: "idle", hex: 0x9a9585, css: "rgb(var(--nc-mid))", intensity: 0.2 },
  waiting: { label: "Waiting", tone: "idle", hex: 0x9a9585, css: "rgb(var(--nc-mid))", intensity: 0.25 },
  thinking: { label: "Thinking", tone: "run", hex: 0xa9c4b3, css: "rgb(var(--nc-cyan))", intensity: 0.6 },
  working: { label: "Working", tone: "run", hex: 0x8faf9a, css: "rgb(var(--nc-cyan))", intensity: 0.8 },
  searching: { label: "Searching", tone: "run", hex: 0x9bc4a0, css: "rgb(var(--nc-cyan))", intensity: 0.9 },
  communicating: { label: "Communicating", tone: "run", hex: 0xc9d6b8, css: "rgb(var(--nc-cyan))", intensity: 0.5 },
  validating: { label: "Validating", tone: "run", hex: 0xa8d0a0, css: "rgb(var(--nc-cyan))", intensity: 0.85 },
  critiquing: { label: "Critiquing", tone: "warn", hex: 0xd6a45b, css: "rgb(var(--nc-warn))", intensity: 0.8 },
  replanning: { label: "Replanning", tone: "warn", hex: 0xc98a3c, css: "rgb(var(--nc-warn))", intensity: 0.8 },
  completed: { label: "Completed", tone: "ok", hex: 0xb9c98a, css: "rgb(var(--nc-ok))", intensity: 0.3 },
  failed: { label: "Failed", tone: "bad", hex: 0xcd644e, css: "rgb(var(--nc-bad))", intensity: 0.7 },
};
