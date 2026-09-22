// The dashboard's whole picture of the run, as one pure function of real state.
//
//   folded events (RunView) + the evaluator's package (RunResult) + agent views + service probes
//     --> DashboardModel
//
// Nothing here invents a value. A count the events do not support is `null` and the page says
// NOT REPORTED; a zero is only ever a real zero (there is a run, and nothing of that kind happened).
// Progress is a count of workflow stages that have REPORTED completion, and says so; the backend
// produces no percentage-complete, so none is made up.
import { shownRoute } from "../../components/facility/facilityState.ts";
import { ZONES } from "../../components/facility/layout.ts";
import type { KnownAgentId } from "../../types/agents.ts";
import type { NeoEvent } from "../../types/events.ts";
import { missedRoute } from "../../types/events.ts";
import type { EvidenceSummary } from "../../types/evidence.ts";
import type { RouteNode } from "../../types/routes.ts";
import type { Project, RunResult } from "../../types/runs.ts";
import { ACTIVITY_META, type Tone } from "../events/activity.ts";
import type { AgentView } from "../events/agentViews.ts";
import { activeAgentId } from "../events/attention.ts";
import { describeEvent } from "../events/describe.ts";
import type { RunView, RouteView } from "../events/fold.ts";
import { WORKFLOW_ORDER } from "../events/presentation.ts";
import { isProblem, type ServiceStatus } from "./services.ts";

export type StageState = "pending" | "active" | "done" | "failed" | "warning" | "skipped";

export interface Stage {
  id: KnownAgentId;
  /** the department's name, as in the lab */
  label: string;
  state: StageState;
  /** what it is doing / did, from its tasks; null = not reported */
  detail: string | null;
}

export interface AgentRow {
  id: string;
  name: string;
  /** IDLE, ACTIVE, SEARCHING, VALIDATING, CRITIQUING, REPLANNING, COMPLETED, FAILED (or UNKNOWN) */
  status: string;
  tone: Tone;
  task: string | null;
  lastEvent: { text: string; tag: string; ts: string; tone: Tone } | null;
  eventCount: number;
}

export interface FeedItem {
  seq: number;
  ts: string;
  agent: string;
  tag: string;
  text: string;
  tone: Tone;
  /** the detailed page that shows this event best */
  href: string;
}

export interface Alert {
  key: string;
  tone: "warn" | "bad";
  title: string;
  detail: string;
  href: string | null;
}

export interface PrecursorView {
  smiles: string;
  inStock: boolean;
  /** this precursor is itself made by further steps */
  furtherSteps: number;
}

export interface RoutePreview {
  routeId: number;
  rank: number;
  steps: number;
  verdict: string;
  verdictTone: Tone;
  target: string;
  precursors: PrecursorView[];
  reactionScore: number | null;
  reactionClass: string | null;
  /** steps beyond the one drawn */
  moreSteps: number;
  recommended: boolean;
}

export interface EvidenceView {
  toolCalls: { total: number; completed: number; failed: number };
  /** null until the evaluator's package carries an evidence summary for the displayed route */
  summary: EvidenceSummary | null;
  analogues: number | null;
  /** the backend's own statement about uncertainty */
  uncertainty: string | null;
}

export interface DashboardModel {
  hasRun: boolean;
  runId: string | null;
  projectName: string | null;
  goal: string | null;
  target: { name: string | null; smiles: string | null };
  phase: RunView["phase"];
  /** ACTIVE / COMPLETED / FAILED / STARTING / NO RUN */
  statusWord: string;
  statusTone: Tone;
  progress: { done: number; total: number; pct: number | null };
  currentAgent: { id: string; name: string; activity: string } | null;
  stages: Stage[];
  loop: { taken: boolean; active: boolean; count: number; reason: string | null; flagged: number; alternatives: number };
  agents: AgentRow[];
  feed: FeedItem[];
  synthesis: {
    generated: number | null;
    validated: number | null;
    rejected: number | null;
    supported: number | null;
    alternatives: number | null;
    attempts: number | null;
    current: string | null;
  };
  route: RoutePreview | null;
  candidates: number | null;
  evidence: EvidenceView;
  alerts: Alert[];
  outcome: string | null;
}

const QUIET = new Set<NeoEvent["type"]>(["AGENT_STATUS_CHANGED", "TOOL_REQUESTED", "TASK_ASSIGNED", "TASK_CREATED"]);

const AGENT_LABEL = (id: string | null): string => (id ? ((ZONES as Record<string, { title: string }>)[id]?.title ?? id.toUpperCase()) : "SYSTEM");

/** Which detailed page shows an event best. */
export function eventHref(ev: NeoEvent): string {
  switch (ev.type) {
    case "ROUTE_GENERATED":
    case "VALIDATION_STARTED":
    case "VALIDATION_COMPLETED":
    case "PROJECT_COMPLETED":
      return "/lab/routes";
    case "CRITIQUE_CREATED":
    case "REPLAN_STARTED":
    case "REPLAN_COMPLETED":
      return "/lab/intelligence";
    case "MOLECULE_RECEIVED":
      return "/lab/chemistry";
    case "TOOL_STARTED":
    case "TOOL_COMPLETED":
    case "TOOL_FAILED":
      return ev.agent_id === "research" ? "/lab/evidence" : "/lab/audit";
    default:
      return "/lab/audit";
  }
}

const AGENT_HREF: Record<string, string> = {
  planner: "/lab/audit",
  research: "/lab/evidence",
  retro: "/lab/routes",
  validator: "/lab/routes",
  critic: "/lab/intelligence",
  replanner: "/lab/intelligence",
  evaluator: "/lab/routes",
};
export const agentHref = (id: string): string => AGENT_HREF[id] ?? "/lab";

const STATUS_WORD: Record<string, string> = {
  unknown: "UNKNOWN",
  idle: "IDLE",
  queued: "QUEUED",
  waiting: "WAITING",
  thinking: "ACTIVE",
  working: "ACTIVE",
  communicating: "ACTIVE",
  searching: "SEARCHING",
  validating: "VALIDATING",
  critiquing: "CRITIQUING",
  replanning: "REPLANNING",
  completed: "COMPLETED",
  failed: "FAILED",
};

const IN_PROGRESS = new Set(["thinking", "working", "searching", "validating", "critiquing", "replanning", "communicating"]);

function stageOf(a: AgentView | undefined, run: RunView, id: KnownAgentId, flagged: boolean): { state: StageState; detail: string | null } {
  const tasks = Object.values(run.tasks).filter((t) => t.agentId === id);
  const running = tasks.find((t) => t.status === "RUNNING");
  const failed = tasks.find((t) => t.status === "FAILED");
  const done = tasks.filter((t) => t.status === "COMPLETED");
  if (a && IN_PROGRESS.has(a.activity)) return { state: "active", detail: (running ?? a.currentTask)?.title ?? null };
  if (a?.activity === "failed" || failed) return { state: "failed", detail: failed?.error ?? failed?.title ?? null };
  if (running) return { state: "active", detail: running.title };
  const pending = tasks.some((t) => t.status === "PENDING");
  if (done.length && !pending) return { state: flagged ? "warning" : "done", detail: done[done.length - 1].title };
  if (tasks.length) return { state: "pending", detail: tasks[tasks.length - 1].title };
  return { state: "pending", detail: null };
}

const latestRoutes = (run: RunView): RouteView[] => run.routeOrder.map((k) => run.routes[k]).filter((r) => r.attempt === run.latestAttempt);

/** The first reaction of the displayed route's tree, drawn as target <- precursors. */
function previewOf(result: RunResult | null): RoutePreview | null {
  const r = shownRoute(result);
  if (!r) return null;
  const root: RouteNode = r.tree;
  const rxn = root.reactions[0];
  const depth = (n: RouteNode): number => n.reactions.reduce((s, x) => s + 1 + x.reactants.reduce((t, m) => t + depth(m), 0), 0);
  const verdict = r.assessment.summary;
  return {
    routeId: r.route_id,
    rank: r.rank,
    steps: r.number_of_reactions,
    verdict: verdict.replace(/_/g, " "),
    verdictTone: verdict === "REVIEW_REQUIRED" ? "bad" : verdict === "INSUFFICIENT_EVIDENCE" ? "warn" : "ok",
    target: root.molecule_smiles,
    precursors: (rxn?.reactants ?? []).slice(0, 4).map((m) => ({ smiles: m.molecule_smiles, inStock: m.is_stock_available, furtherSteps: depth(m) })),
    reactionScore: rxn?.score ?? null,
    // AiZynthFinder emits "0.0 Unrecognized" when no reaction classifier is loaded: that is the absence of a class
    reactionClass: rxn?.classification && !/unrecogni[sz]ed/i.test(rxn.classification) ? rxn.classification : null,
    moreSteps: Math.max(0, r.number_of_reactions - 1),
    recommended: result?.recommended_route_id === r.route_id,
  };
}

export function buildDashboard(input: {
  run: RunView;
  result: RunResult | null;
  agents: readonly AgentView[];
  project: Pick<Project, "name" | "goal"> | null;
  services: readonly ServiceStatus[];
}): DashboardModel {
  const { run, result, agents, project, services } = input;
  const hasRun = run.runId !== null;
  const hasEvents = hasRun && run.events.length > 0;
  const ended = run.phase === "completed" || run.phase === "failed";

  // --- target ---------------------------------------------------------------------------------------------
  const targetSmiles = run.target?.canonical_smiles ?? result?.target.canonical_smiles ?? null;
  const targetName = run.target?.matched_name ?? result?.target.matched_name ?? null;

  // --- workflow -------------------------------------------------------------------------------------------
  const routes = run.routeOrder.map((k) => run.routes[k]);
  const latest = latestRoutes(run);
  const flagged = latest.filter((r) => r.validation?.assessment === "REVIEW_REQUIRED");
  const byId = new Map(agents.map((a) => [a.id, a]));
  // Anything but retrosynthesis is a short run: the Orchestrator, the Research Agent and the Evaluator.
  const shortRun = run.task !== null && run.task !== "retrosynthesis";
  const stages: Stage[] = WORKFLOW_ORDER.map((id) => {
    if (shortRun && id !== "planner" && id !== "research" && id !== "evaluator") {
      return { id, label: AGENT_LABEL(id), state: "skipped", detail: `not needed for ${run.task}` };
    }
    const s = stageOf(byId.get(id), run, id, id === "validator" && flagged.length > 0);
    let state = s.state;
    let detail = s.detail;
    if (id === "replanner" && run.replans.length === 0 && !run.replanActive) {
      state = ended ? "skipped" : "pending";
      detail = ended ? "not needed in this run" : null;
    }
    if (id === "replanner" && run.replanActive) state = "active";
    return { id, label: AGENT_LABEL(id), state, detail: hasEvents ? detail : null };
  });
  // a finished run has finished every stage that was needed
  if (run.phase === "completed") for (const s of stages) if (s.state === "pending" && s.id !== "replanner") s.state = "done";

  const counted = stages.filter((s) => s.state !== "skipped" && (s.id !== "replanner" || run.replans.length > 0 || run.replanActive));
  const doneN = counted.filter((s) => s.state === "done" || s.state === "warning").length;
  const progress = { done: doneN, total: counted.length, pct: hasEvents ? (run.phase === "completed" ? 100 : Math.round((doneN / counted.length) * 100)) : null };

  const activeId = hasEvents && !ended ? activeAgentId(agents) : null;
  const activeAgent = activeId ? (agents.find((a) => a.id === activeId) ?? null) : null;

  const statusWord = !hasRun ? "NO RUN" : run.phase === "completed" ? "COMPLETED" : run.phase === "failed" ? "FAILED" : hasEvents ? "ACTIVE" : "STARTING";
  const statusTone: Tone = !hasRun ? "dim" : run.phase === "completed" ? "ok" : run.phase === "failed" ? "bad" : "run";

  const lastReplan = run.replans[run.replans.length - 1] ?? null;
  const loop = {
    taken: run.replans.length > 0,
    active: run.replanActive,
    count: run.replans.length,
    reason: lastReplan?.reason ?? null,
    flagged: flagged.length,
    alternatives: routes.filter((r) => r.attempt > 1).length,
  };

  // --- agents ------------------------------------------------------------------------------------------------
  const agentRows: AgentRow[] = agents.map((a) => {
    let last: NeoEvent | null = null;
    let count = 0;
    for (let i = run.events.length - 1; i >= 0; i--) {
      const ev = run.events[i];
      if (ev.agent_id !== a.id) continue;
      count++;
      if (!last && !QUIET.has(ev.type)) last = ev;
    }
    const d = last ? describeEvent(last) : null;
    return {
      id: a.id,
      // the roster names the agent; without it (API offline) fall back to its department's name, not its raw id
      name: a.name === a.id ? AGENT_LABEL(a.id).charAt(0) + AGENT_LABEL(a.id).slice(1).toLowerCase() : a.name,
      status: STATUS_WORD[a.activity] ?? ACTIVITY_META[a.activity].label.toUpperCase(),
      tone: ACTIVITY_META[a.activity].tone,
      task: a.currentTask?.title ?? null,
      lastEvent: last && d ? { text: d.text, tag: d.tag, ts: last.ts, tone: d.tone } : null,
      eventCount: count,
    };
  });

  // --- the feed ----------------------------------------------------------------------------------------------
  const feed: FeedItem[] = [];
  for (let i = run.events.length - 1; i >= 0 && feed.length < 60; i--) {
    const ev = run.events[i];
    if (QUIET.has(ev.type)) continue;
    const d = describeEvent(ev);
    feed.push({ seq: ev.seq, ts: ev.ts, agent: AGENT_LABEL(ev.agent_id), tag: d.tag, text: d.text, tone: d.tone, href: eventHref(ev) });
  }

  // --- synthesis intelligence ------------------------------------------------------------------------------------------
  const judged = routes.filter((r) => r.validation);
  const supported = judged.filter((r) => r.validation?.assessment === "SUPPORTED" || r.validation?.assessment === "STRONGLY_SUPPORTED").length;
  const rejected = judged.filter((r) => r.validation?.assessment === "REVIEW_REQUIRED").length;
  const top = shownRoute(result);
  const current = top
    ? `route ${top.route_id} · ${top.number_of_reactions} step${top.number_of_reactions === 1 ? "" : "s"} · rank ${top.rank} of ${result?.ranked_routes.length}`
    : latest.length
      ? `${latest.length} candidate${latest.length === 1 ? "" : "s"} in attempt ${run.latestAttempt}`
      : null;
  const synthesis = {
    generated: hasEvents ? routes.length : null,
    validated: hasEvents ? judged.length : null,
    rejected: hasEvents ? rejected : null,
    supported: hasEvents ? supported : null,
    alternatives: hasEvents ? loop.alternatives : null,
    attempts: hasEvents ? run.latestAttempt : null,
    current,
  };

  // --- evidence -----------------------------------------------------------------------------------------------------------
  const calls = run.callOrder.map((id) => run.calls[id]).filter(Boolean);
  const an = result?.profile?.analogues;
  const evidence: EvidenceView = {
    toolCalls: { total: calls.length, completed: calls.filter((c) => c.status === "COMPLETED").length, failed: calls.filter((c) => c.status === "FAILED" || c.status === "DENIED").length },
    summary: top?.evidence_summary ?? null,
    analogues: an && !("error" in an) ? an.hits.length : null,
    uncertainty: hasRun ? `The backend produces no probability or confidence score. ${result?.limitations[0] ?? ""}`.trim() : null,
  };

  // --- alerts (restrained: the few things a chemist should look at) ---------------------------------------------------------------
  const alerts: Alert[] = [];
  if (run.phase === "failed") alerts.push({ key: "run-failed", tone: "bad", title: "RUN FAILED", detail: run.error ?? "the run failed; no reason was reported", href: "/lab/audit" });
  for (const r of flagged) alerts.push({ key: `val-${r.key}`, tone: "bad", title: "VALIDATION FAILED", detail: `Route ${r.routeId}: ${r.validation?.label ?? "review required"}`, href: "/lab/routes" });
  if (run.replanActive || lastReplan) alerts.push({ key: `replan-${lastReplan?.seq ?? 0}`, tone: "warn", title: run.replanActive ? "REPLANNING IN PROGRESS" : "REPLANNING TRIGGERED", detail: lastReplan?.reason ?? "the replanner was started", href: "/lab/intelligence" });
  const failedCall = calls.filter((c) => c.status === "FAILED" || c.status === "DENIED").pop();
  if (failedCall && run.phase !== "failed") alerts.push({ key: `call-${failedCall.callId}`, tone: "bad", title: failedCall.status === "DENIED" ? "TOOL DENIED" : "TOOL FAILED", detail: `${failedCall.tool}: ${failedCall.error ?? "no detail"}`, href: "/lab/audit" });
  if (evidence.summary && (evidence.summary.steps_with_experimental_evidence === 0 || evidence.summary.steps_without_evidence > 0)) {
    alerts.push({ key: "evidence", tone: "warn", title: "EVIDENCE INCOMPLETE", detail: `${evidence.summary.steps_with_experimental_evidence} of ${evidence.summary.steps} steps have direct experimental precedent`, href: "/lab/evidence" });
  }
  if (result && missedRoute(result)) alerts.push({ key: "norec", tone: "warn", title: "NO ROUTE RECOMMENDED", detail: result.recommendation, href: "/lab/routes" });
  for (const s of services) if (isProblem(s) && s.id !== "evidence") alerts.push({ key: `svc-${s.id}`, tone: s.state === "warn" ? "warn" : "bad", title: "SERVICE UNAVAILABLE", detail: `${s.label}${s.detail ? ` — ${s.detail}` : ""}`, href: null });

  return {
    hasRun,
    runId: run.runId,
    projectName: project?.name ?? null,
    goal: project?.goal ?? null,
    target: { name: targetName, smiles: targetSmiles },
    phase: run.phase,
    statusWord,
    statusTone,
    progress,
    currentAgent: activeAgent ? { id: activeAgent.id, name: activeAgent.name, activity: STATUS_WORD[activeAgent.activity] ?? "ACTIVE" } : null,
    stages,
    loop,
    agents: agentRows,
    feed,
    synthesis,
    route: previewOf(result),
    candidates: hasEvents ? latest.length : null,
    evidence,
    alerts: alerts.slice(0, 8),
    outcome: result?.recommendation ?? run.outcome?.recommendation ?? null,
  };
}
