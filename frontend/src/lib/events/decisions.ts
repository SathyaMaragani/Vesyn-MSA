// Structured, user-facing decision summaries built ONLY from event payloads and
// the backend's own limitation strings. No model reasoning is exposed and none is
// invented: where the events carry no evidence or uncertainty text the field is
// null and the UI says "not reported".
import type { NeoEvent } from "../../types/events.ts";
import type { Tone } from "./activity.ts";
import type { RunView, ToolCallView } from "./fold.ts";

export interface Decision {
  seq: number;
  agentId: string | null;
  title: string;
  tone: Tone;
  trigger: string;
  action: string;
  evidence: string | null;
  uncertainty: string | null;
}

const budget = (b: { iteration_limit: number; top_n: number }) => `${b.iteration_limit} iterations, top ${b.top_n}`;

function signalSummary(signals: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const [tool, value] of Object.entries(signals)) {
    if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.error === "string") parts.push(`${tool}: unavailable (${o.error})`);
      else parts.push(`${tool}: ${Object.entries(o).map(([k, v]) => `${k} ${String(v)}`).join(", ")}`);
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

const pick = (limitations: readonly string[] | null, needle: string): string | null =>
  limitations?.find((l) => l.toLowerCase().includes(needle)) ?? null;

function fromEvent(ev: NeoEvent, limitations: readonly string[] | null): Decision | null {
  switch (ev.type) {
    case "VALIDATION_COMPLETED": {
      const flagged = ev.data.assessment === "REVIEW_REQUIRED";
      const hasForward = Object.keys(ev.data.signals ?? {}).some((k) => k.startsWith("reactiont5"));
      return {
        seq: ev.seq,
        agentId: ev.agent_id,
        title: `Route ${ev.data.route_id}: ${ev.data.label}`,
        tone: flagged ? "bad" : ev.data.assessment === "INSUFFICIENT_EVIDENCE" ? "warn" : "ok",
        trigger: `Validation of route ${ev.data.route_id} (attempt ${ev.data.attempt}) completed.`,
        action: flagged
          ? "Route flagged for review and excluded from any recommendation."
          : "Route retained for critique and ranking.",
        evidence: signalSummary(ev.data.signals ?? {}),
        uncertainty: hasForward ? pick(limitations, "reactiont5") : null,
      };
    }
    case "CRITIQUE_CREATED":
      return {
        seq: ev.seq,
        agentId: ev.agent_id,
        title: `Route ${ev.data.route_id} critiqued`,
        tone: (ev.data.counts?.high ?? 0) > 0 ? "bad" : "warn",
        trigger: "Validated routes passed to the critic.",
        action: ev.data.headline,
        evidence: ev.data.strengths?.length ? `Strengths: ${ev.data.strengths.join(" ")}` : null,
        uncertainty: pick(limitations, "no precedent"),
      };
    case "REPLAN_STARTED":
      return {
        seq: ev.seq,
        agentId: ev.agent_id,
        title: "Search widened",
        tone: "warn",
        trigger: ev.data.reason,
        action: `Alternative route search: ${budget(ev.data.previous)} → ${budget(ev.data.next)}.`,
        evidence: null,
        uncertainty: null,
      };
    case "PROJECT_COMPLETED":
      return {
        seq: ev.seq,
        agentId: ev.agent_id,
        title: ev.data.recommended_route_id === null ? "No route recommended" : "Route recommended",
        tone: ev.data.recommended_route_id === null ? "warn" : "ok",
        trigger: `${ev.data.routes} route(s) ranked.`,
        action: ev.data.recommendation,
        evidence: null,
        uncertainty: pick(limitations, "lab"),
      };
    case "PROJECT_FAILED":
      return {
        seq: ev.seq,
        agentId: ev.agent_id,
        title: "Run failed",
        tone: "bad",
        trigger: "A step raised an error the team could not degrade around.",
        action: ev.data.error,
        evidence: null,
        uncertainty: null,
      };
    default:
      return null;
  }
}

/** Decisions in the order they happened, newest last. */
export function buildDecisions(run: RunView, limitations: readonly string[] | null): Decision[] {
  const out: Decision[] = [];
  for (const ev of run.events) {
    const d = fromEvent(ev, limitations);
    if (d) out.push(d);
  }
  return out;
}

/** Tool calls that failed or were denied - signals the run had to do without. */
export function degradedSignals(run: RunView): ToolCallView[] {
  return run.callOrder.map((id) => run.calls[id]).filter((c): c is ToolCallView => !!c && (c.status === "FAILED" || c.status === "DENIED"));
}
