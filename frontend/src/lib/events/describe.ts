// One-line, human-readable description of an event. Built only from the event's
// own payload - no inference, no invented detail.
import type { NeoEvent } from "../../types/events.ts";
import { missedRoute } from "../../types/events.ts";
import type { Tone } from "./activity.ts";

export interface EventLine {
  /** Short category shown as a tag. */
  tag: string;
  text: string;
  tone: Tone;
}

const budget = (b: { iteration_limit: number; top_n: number }): string =>
  `${b.iteration_limit} iterations, top ${b.top_n}`;

export function describeEvent(ev: NeoEvent): EventLine {
  const who = ev.agent_id ?? "agent";
  switch (ev.type) {
    case "RUN_STARTED":
      return { tag: "RUN", text: `Run started for ${ev.data.query} (${budget(ev.data.params)})`, tone: "run" };
    case "AGENT_STATUS_CHANGED":
      return { tag: "STATE", text: `${who} → ${ev.data.status}`, tone: "idle" };
    case "TASK_CREATED":
      return {
        tag: "TASK",
        text: `Created: ${ev.data.title}${ev.data.attempt > 1 ? ` (attempt ${ev.data.attempt})` : ""}`,
        tone: "idle",
      };
    case "TASK_ASSIGNED":
      return { tag: "TASK", text: `${ev.data.title} → ${ev.data.assignee}`, tone: "idle" };
    case "TASK_STARTED":
      return { tag: "TASK", text: `${who} started a task`, tone: "run" };
    case "TASK_COMPLETED":
      return { tag: "TASK", text: `${who} completed a task`, tone: "ok" };
    case "TASK_FAILED":
      return { tag: "TASK", text: `${who} task failed: ${ev.data.error}`, tone: "bad" };
    case "TOOL_REQUESTED":
      return { tag: "TOOL", text: `${who} requested ${ev.data.tool}`, tone: "idle" };
    case "TOOL_STARTED":
      return { tag: "TOOL", text: `${who} → ${ev.data.tool} ${ev.data.version}`, tone: "run" };
    case "TOOL_COMPLETED":
      return { tag: "TOOL", text: `${ev.data.tool} finished in ${ev.data.duration_ms} ms`, tone: "ok" };
    case "TOOL_FAILED":
      return {
        tag: ev.data.status === "DENIED" ? "DENIED" : "TOOL",
        text: `${ev.data.tool} ${ev.data.status === "DENIED" ? "denied by policy" : "failed"}: ${ev.data.error}`,
        tone: "bad",
      };
    case "MESSAGE_SENT":
      return { tag: "MSG", text: `${who} → ${ev.data.to}: ${ev.data.text}`, tone: "idle" };
    case "MOLECULE_RECEIVED":
      return { tag: "TARGET", text: `Resolved ${ev.data.query} → ${ev.data.smiles} (${ev.data.source})`, tone: "run" };
    case "ROUTE_GENERATED":
      return {
        tag: "ROUTE",
        text: `Route ${ev.data.route_id}: ${ev.data.steps} step(s), attempt ${ev.data.attempt}`,
        tone: "run",
      };
    case "VALIDATION_STARTED":
      return { tag: "VALID", text: `Validating route ${ev.data.route_id} (${ev.data.steps} step(s))`, tone: "run" };
    case "VALIDATION_COMPLETED":
      return {
        tag: "VALID",
        text: `Route ${ev.data.route_id}: ${ev.data.label}`,
        tone:
          ev.data.assessment === "REVIEW_REQUIRED"
            ? "bad"
            : ev.data.assessment === "INSUFFICIENT_EVIDENCE"
              ? "warn"
              : "ok",
      };
    case "CRITIQUE_CREATED":
      return { tag: "CRITIC", text: `Route ${ev.data.route_id}: ${ev.data.headline}`, tone: "warn" };
    case "REPLAN_STARTED":
      return {
        tag: "REPLAN",
        text: `${ev.data.reason} Widening ${budget(ev.data.previous)} → ${budget(ev.data.next)}`,
        tone: "warn",
      };
    case "REPLAN_COMPLETED":
      return { tag: "REPLAN", text: `Replan ready: ${budget(ev.data.next)}`, tone: "warn" };
    case "PROJECT_COMPLETED":
      return {
        tag: "DONE",
        text: ev.data.recommendation,
        tone: missedRoute(ev.data) ? "warn" : "ok",
      };
    case "PROJECT_FAILED":
      return { tag: "FAILED", text: ev.data.error, tone: "bad" };
  }
}
