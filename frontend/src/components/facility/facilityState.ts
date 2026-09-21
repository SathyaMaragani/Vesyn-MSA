// What the facility shows, as a pure function of REAL state: the roster + folded events (AgentView[],
// RunView) and, once the run has finished, the evaluator's final package (RunResult).
// Nothing here is invented. A value the backend did not report is null, and the world renders that as
// "not reported" (or shows nothing), never a plausible-looking number.
import { KNOWN_AGENT_IDS, type Activity, type KnownAgentId } from "../../types/agents.ts";
import type { AssessmentSummary, Severity } from "../../types/events.ts";
import type { RankedRoute } from "../../types/routes.ts";
import type { RunResult } from "../../types/runs.ts";
import type { AgentView } from "../../lib/events/agentViews.ts";
import type { ReplanView, RunPhase, RunView } from "../../lib/events/fold.ts";

/** The facility's state vocabulary: elegant, not gaming-bright. */
export type Tone = "dormant" | "idle" | "active" | "processing" | "warning" | "failed" | "complete";

export interface ToneLook {
  /** three.js colour of the department's accents and lights */
  hex: number;
  /** 0..1 how present the department is in the room (inactive areas recede) */
  power: number;
  /** pulse rate of the accents (Hz); 0 = steady */
  pulse: number;
}

export const TONE_LOOK: Record<Tone, ToneLook> = {
  dormant: { hex: 0x4d4b42, power: 0.26, pulse: 0 }, //     the facility has no run: standing lights only
  idle: { hex: 0x8a857a, power: 0.46, pulse: 0 }, //        subtle warm grey
  active: { hex: 0x8faf9a, power: 1, pulse: 0 }, //         mineral green / sage
  processing: { hex: 0xd6a45b, power: 0.98, pulse: 0.7 }, // soft amber
  warning: { hex: 0xb87552, power: 0.92, pulse: 1.1 }, //   muted copper
  failed: { hex: 0xa8493a, power: 0.9, pulse: 0.55 }, //    restrained red-copper
  complete: { hex: 0xcdd6b8, power: 0.72, pulse: 0 }, //    warm ivory-green
};

export function toneOf(activity: Activity, flagged = false): Tone {
  switch (activity) {
    case "unknown":
      return "dormant";
    case "idle":
    case "queued":
    case "waiting":
      return flagged ? "warning" : "idle";
    case "thinking":
    case "working":
    case "searching":
    case "communicating":
      return "active";
    case "validating":
    case "critiquing":
    case "replanning":
      return "processing";
    case "completed":
      return flagged ? "warning" : "complete";
    case "failed":
      return "failed";
  }
}

export interface ToolUse {
  name: string;
  status: "REQUESTED" | "RUNNING" | "COMPLETED" | "FAILED" | "DENIED";
  ms: number | null;
}

export interface ZoneState {
  id: KnownAgentId;
  /** The roster's name for this agent (backend), or its id when the roster is not loaded. */
  name: string;
  role: string | null;
  activity: Activity;
  tone: Tone;
  /** Doing something right now (a tool call is in flight, or the agent is mid-task). */
  busy: boolean;
  task: string | null;
  /** The reason for the tool in flight, or the tool itself, or the running task. */
  step: string | null;
  tools: ToolUse[];
  /** Real error text when this agent's task or tool failed. */
  error: string | null;
  events: number;
}

export interface RouteState {
  key: string;
  routeId: number;
  attempt: number;
  latest: boolean;
  steps: number | null;
  score: number | null;
  validating: boolean;
  assessment: AssessmentSummary | null;
  label: string | null;
  critique: { counts: Partial<Record<Severity, number>>; headline: string } | null;
}

export interface RankedEntry {
  routeId: number;
  rank: number;
  score: number;
  attempt: number;
  assessment: AssessmentSummary;
  steps: number;
  recommended: boolean;
}

export interface TaskToken {
  id: string;
  agentId: string | null;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
}

export interface FacilityState {
  phase: RunPhase;
  /** A run exists and has events: the facility is awake. */
  awake: boolean;
  zones: Record<KnownAgentId, ZoneState>;
  routes: RouteState[];
  /** Routes of the newest search attempt (what the halls are working on now). */
  current: RouteState[];
  tasks: TaskToken[];
  replan: { active: boolean; count: number; last: ReplanView | null };
  target: { smiles: string; name: string | null } | null;
  params: { topN: number; iterationLimit: number } | null;
  ranked: RankedEntry[];
  recommendedRouteId: number | null;
  recommendation: string | null;
  /** The evaluator's final package, when the run has produced it. */
  result: RunResult | null;
  /** The agent doing something right now (earliest in workflow order), or null. */
  activeId: KnownAgentId | null;
  error: string | null;
}

const WORKFLOW: readonly KnownAgentId[] = ["planner", "research", "retro", "validator", "critic", "replanner", "evaluator"];
const IN_PROGRESS = new Set<Activity>(["thinking", "working", "searching", "validating", "critiquing", "replanning", "communicating"]);

export function buildFacilityState(input: { agents: readonly AgentView[]; run: RunView; result: RunResult | null }): FacilityState {
  const { agents, run, result } = input;
  const awake = run.runId !== null && run.events.length > 0;

  // count events per agent once
  const perAgent = new Map<string, number>();
  for (const ev of run.events) if (ev.agent_id) perAgent.set(ev.agent_id, (perAgent.get(ev.agent_id) ?? 0) + 1);

  const routes: RouteState[] = run.routeOrder
    .map((k) => run.routes[k])
    .filter((r) => r !== undefined)
    .map((r) => ({
      key: r.key,
      routeId: r.routeId,
      attempt: r.attempt,
      latest: r.attempt === run.latestAttempt,
      steps: r.steps,
      score: r.stateScore,
      validating: r.validationStarted && r.validation === null,
      assessment: r.validation?.assessment ?? null,
      label: r.validation?.label ?? null,
      critique: r.critique ? { counts: r.critique.counts, headline: r.critique.headline } : null,
    }));
  const current = routes.filter((r) => r.latest);
  // a validator that flagged a route in the newest attempt reads as a warning even after it finishes
  const flagged = current.some((r) => r.assessment === "REVIEW_REQUIRED");

  const zones = {} as Record<KnownAgentId, ZoneState>;
  for (const id of KNOWN_AGENT_IDS) {
    const a = agents.find((x) => x.id === id);
    const activity: Activity = a?.activity ?? "unknown";
    const calls = awake
      ? run.callOrder.map((c) => run.calls[c]).filter((c) => c !== undefined && c.agentId === id)
      : [];
    const open = calls.filter((c) => c.status === "REQUESTED" || c.status === "RUNNING");
    const failedCall = [...calls].reverse().find((c) => c.status === "FAILED" || c.status === "DENIED");
    const task = a?.currentTask ?? null;
    const errorText = task?.error ?? failedCall?.error ?? null;
    const step = open[0] ? (open[0].reason ?? open[0].tool) : task && task.status === "RUNNING" ? task.title : null;
    zones[id] = {
      id,
      name: a?.name ?? id,
      role: a?.role ?? null,
      activity,
      tone: toneOf(activity, id === "validator" && flagged && activity !== "failed"),
      busy: (a?.activeCalls.length ?? 0) > 0 || (IN_PROGRESS.has(activity) && activity !== "communicating"),
      task: task?.title ?? null,
      step,
      tools: calls.slice(-6).map((c) => ({ name: c.tool, status: c.status, ms: c.durationMs })),
      error: activity === "failed" || errorText ? errorText : null,
      events: perAgent.get(id) ?? 0,
    };
  }

  let activeId: KnownAgentId | null = null;
  for (const id of WORKFLOW) {
    if (IN_PROGRESS.has(zones[id].activity)) {
      activeId = id;
      break;
    }
  }

  const ranked: RankedEntry[] = (result?.ranked_routes ?? []).map((r: RankedRoute) => ({
    routeId: r.route_id,
    rank: r.rank,
    score: r.score,
    attempt: r.attempt,
    assessment: r.assessment.summary,
    steps: r.number_of_reactions,
    recommended: result?.recommended_route_id === r.route_id,
  }));

  return {
    phase: run.phase,
    awake,
    zones,
    routes,
    current,
    tasks: run.taskOrder.map((id) => ({ id, agentId: run.tasks[id]?.agentId ?? null, status: run.tasks[id]?.status ?? "PENDING" })),
    replan: { active: run.replanActive, count: run.replans.length, last: run.replans[run.replans.length - 1] ?? null },
    target: run.target ? { smiles: run.target.canonical_smiles, name: run.target.matched_name } : null,
    params: run.params ? { topN: run.params.top_n, iterationLimit: run.params.iteration_limit } : null,
    ranked,
    recommendedRouteId: run.outcome?.recommendedRouteId ?? result?.recommended_route_id ?? null,
    recommendation: run.outcome?.recommendation ?? result?.recommendation ?? null,
    result,
    activeId,
    error: run.error,
  };
}

/** The colour of a validator verdict on a route. */
export const ASSESSMENT_HEX: Record<AssessmentSummary | "pending", number> = {
  pending: 0x8faf9a,
  STRONGLY_SUPPORTED: 0xcdd6b8,
  SUPPORTED: 0xb9c98a,
  INSUFFICIENT_EVIDENCE: 0xd6a45b,
  REVIEW_REQUIRED: 0xb5533c,
};

/** Short, honest name of a verdict for signage. */
export const ASSESSMENT_WORD: Record<AssessmentSummary, string> = {
  STRONGLY_SUPPORTED: "STRONGLY SUPPORTED",
  SUPPORTED: "SUPPORTED",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT EVIDENCE",
  REVIEW_REQUIRED: "REVIEW REQUIRED",
};

/** The route the halls put on display: the recommended one, else the top-ranked; null until the run has a result. */
export function shownRoute(result: RunResult | null): RankedRoute | null {
  const r = result?.ranked_routes;
  if (!r || r.length === 0) return null;
  return r.find((x) => x.route_id === result?.recommended_route_id) ?? r[0];
}

export interface Projection {
  smiles: string;
  /** what the molecule is, in the backend's terms */
  role: "STARTING MATERIAL" | "ANALOGUE";
  note: string;
}

/**
 * The molecules that stand around the core as projections. Only real ones: the displayed route's
 * starting materials (with the validator's stock check), else the research agent's ChEMBL analogues
 * (with their Tanimoto similarity). With neither, nothing stands there.
 */
export function projectionsOf(result: RunResult | null, max = 4): { kind: "route" | "analogue" | "none"; items: Projection[] } {
  const route = shownRoute(result);
  if (route && route.starting_materials.length) {
    const seen = new Set<string>();
    const items: Projection[] = [];
    for (const m of route.starting_materials) {
      if (seen.has(m.smiles)) continue;
      seen.add(m.smiles);
      items.push({ smiles: m.smiles, role: "STARTING MATERIAL", note: m.in_stock ? "in stock" : "not in stock" });
      if (items.length >= max) break;
    }
    return { kind: "route", items };
  }
  const an = result?.profile?.analogues;
  if (an && !("error" in an) && an.hits.length) {
    return { kind: "analogue", items: an.hits.slice(0, max).map((h) => ({ smiles: h.smiles, role: "ANALOGUE" as const, note: `Tanimoto ${h.tanimoto.toFixed(3)}` })) };
  }
  return { kind: "none", items: [] };
}
