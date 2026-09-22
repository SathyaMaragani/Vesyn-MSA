// "Which agent should the camera follow" and "what deserves the user's attention",
// both derived from real folded state.
import { WORKFLOW_ORDER } from "./presentation.ts";
import type { AgentView } from "./agentViews.ts";
import type { RunView } from "./fold.ts";
import { missedRoute } from "../../types/events.ts";

const IN_PROGRESS = new Set(["thinking", "working", "searching", "validating", "critiquing", "replanning", "communicating"]);

/**
 * The agent doing something right now. When several are active (research and
 * retro run in parallel) the earliest in workflow order wins; when none is, null.
 */
export function activeAgentId(agents: readonly AgentView[]): string | null {
  for (const id of WORKFLOW_ORDER) {
    const a = agents.find((x) => x.id === id);
    if (a && IN_PROGRESS.has(a.activity)) return id;
  }
  return null;
}

export interface Alert {
  /** Event seq it came from - stable identity, and dismissal key. */
  seq: number;
  tone: "warn" | "bad" | "ok";
  title: string;
  detail: string;
  /** Agent whose workstation "INSPECT" should move the camera to. */
  agentId: string;
  /** Workspace that holds the detail. */
  href: "/lab/routes" | "/lab/intelligence" | "/lab/audit";
}

/**
 * The most recent event a chemist should stop and look at: a route flagged for
 * review, a replan, a refusal to recommend, or a failure. Null when nothing has
 * happened yet that warrants attention.
 */
export function latestAlert(run: RunView): Alert | null {
  for (let i = run.events.length - 1; i >= 0; i--) {
    const ev = run.events[i];
    switch (ev.type) {
      case "PROJECT_FAILED":
        return { seq: ev.seq, tone: "bad", title: "RUN FAILED", detail: ev.data.error, agentId: "planner", href: "/lab/audit" };
      case "PROJECT_COMPLETED":
        return {
          seq: ev.seq,
          tone: missedRoute(ev.data) ? "warn" : "ok",
          title: missedRoute(ev.data) ? "NO ROUTE RECOMMENDED" : "RUN COMPLETED",
          detail: ev.data.recommendation,
          agentId: "evaluator",
          href: "/lab/routes",
        };
      case "REPLAN_STARTED":
        return { seq: ev.seq, tone: "warn", title: "REPLANNING", detail: ev.data.reason, agentId: "replanner", href: "/lab/intelligence" };
      case "VALIDATION_COMPLETED":
        if (ev.data.assessment === "REVIEW_REQUIRED") {
          return {
            seq: ev.seq,
            tone: "bad",
            title: "VALIDATION FLAGGED",
            detail: `Route ${ev.data.route_id}: ${ev.data.label}`,
            agentId: "validator",
            href: "/lab/routes",
          };
        }
        break;
      default:
        break;
    }
  }
  return null;
}
