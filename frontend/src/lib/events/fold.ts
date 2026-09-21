// The only place backend events become UI state.
//
//   events (sorted by seq) --fold--> RunView
//
// Pure and deterministic: the same events always yield the same view, so a
// reconnect, a replay of a finished run and a live tail all converge. Nothing
// here invents a value - fields the events did not carry stay null/absent and
// the UI renders "not reported".
import type { AgentStatus, Station } from "../../types/agents.ts";
import type { AssessmentSummary, NeoEvent, SearchBudget, Severity } from "../../types/events.ts";
import type { TargetResolution } from "../../types/chemistry.ts";
import type { RunParams } from "../../types/runs.ts";

export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type CallStatus = "REQUESTED" | "RUNNING" | "COMPLETED" | "FAILED" | "DENIED";
export type RunPhase = "none" | "running" | "completed" | "failed";

export interface AgentLive {
  id: string;
  status: AgentStatus;
  station: Station | null;
  currentTaskId: string | null;
  /** Tool calls in flight for this agent (the validator runs several at once). */
  activeCalls: string[];
}

export interface TaskView {
  id: string;
  agentId: string | null;
  title: string;
  attempt: number;
  status: TaskStatus;
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface ToolCallView {
  callId: string;
  tool: string;
  agentId: string | null;
  taskId: string | null;
  reason: string | null;
  version: string | null;
  station: Station | null;
  status: CallStatus;
  input: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
  requestedSeq: number;
  requestedAt: string;
}

export interface MessageView {
  seq: number;
  id: string;
  from: string | null;
  to: string;
  text: string;
  ts: string;
}

export interface RouteView {
  key: string;
  routeId: number;
  attempt: number;
  steps: number | null;
  stateScore: number | null;
  validationStarted: boolean;
  validation: { assessment: AssessmentSummary; label: string; signals: Record<string, unknown> } | null;
  critique: { counts: Partial<Record<Severity, number>>; headline: string; strengths: string[] } | null;
}

export interface ReplanView {
  seq: number;
  reason: string;
  previous: SearchBudget;
  next: SearchBudget;
  completed: boolean;
}

export interface RunView {
  runId: string | null;
  projectId: string | null;
  phase: RunPhase;
  query: string | null;
  params: RunParams | null;
  error: string | null;
  target: Pick<TargetResolution, "canonical_smiles" | "source" | "matched_name"> | null;
  agents: Record<string, AgentLive>;
  tasks: Record<string, TaskView>;
  taskOrder: string[];
  calls: Record<string, ToolCallView>;
  callOrder: string[];
  messages: MessageView[];
  routes: Record<string, RouteView>;
  routeOrder: string[];
  latestAttempt: number;
  replans: ReplanView[];
  replanActive: boolean;
  outcome: { recommendedRouteId: number | null; recommendation: string; routes: number } | null;
  /** Every accepted event, sorted by seq. The audit view's "Events" tab reads this. */
  events: NeoEvent[];
  lastSeq: number;
}

export function emptyRun(runId: string | null): RunView {
  return {
    runId,
    projectId: null,
    phase: "none",
    query: null,
    params: null,
    error: null,
    target: null,
    agents: {},
    tasks: {},
    taskOrder: [],
    calls: {},
    callOrder: [],
    messages: [],
    routes: {},
    routeOrder: [],
    latestAttempt: 1,
    replans: [],
    replanActive: false,
    outcome: null,
    events: [],
    lastSeq: 0,
  };
}

const routeKey = (attempt: number, routeId: number): string => `${attempt}:${routeId}`;

function patchAgent(s: RunView, id: string | null, patch: (a: AgentLive) => Partial<AgentLive>): RunView {
  if (!id) return s;
  const prev: AgentLive = s.agents[id] ?? {
    id,
    status: "IDLE",
    station: null,
    currentTaskId: null,
    activeCalls: [],
  };
  return { ...s, agents: { ...s.agents, [id]: { ...prev, ...patch(prev) } } };
}

function patchTask(s: RunView, ev: NeoEvent, patch: Partial<TaskView>): RunView {
  const id = ev.task_id;
  if (!id) return s;
  const prev: TaskView | undefined = s.tasks[id];
  const task: TaskView = {
    id,
    agentId: prev?.agentId ?? ev.agent_id,
    title: prev?.title ?? "(untitled task)",
    attempt: prev?.attempt ?? 1,
    status: prev?.status ?? "PENDING",
    output: prev?.output ?? null,
    error: prev?.error ?? null,
    ...patch,
  };
  return {
    ...s,
    tasks: { ...s.tasks, [id]: task },
    taskOrder: prev ? s.taskOrder : [...s.taskOrder, id],
  };
}

function patchCall(s: RunView, ev: NeoEvent, callId: string, patch: Partial<ToolCallView>): RunView {
  const prev: ToolCallView | undefined = s.calls[callId];
  const call: ToolCallView = {
    callId,
    tool: prev?.tool ?? "(unknown tool)",
    agentId: prev?.agentId ?? ev.agent_id,
    taskId: prev?.taskId ?? ev.task_id,
    reason: prev?.reason ?? null,
    version: prev?.version ?? null,
    station: prev?.station ?? null,
    status: prev?.status ?? "REQUESTED",
    input: prev?.input ?? null,
    summary: prev?.summary ?? null,
    error: prev?.error ?? null,
    durationMs: prev?.durationMs ?? null,
    requestedSeq: prev?.requestedSeq ?? ev.seq,
    requestedAt: prev?.requestedAt ?? ev.ts,
    ...patch,
  };
  return {
    ...s,
    calls: { ...s.calls, [callId]: call },
    callOrder: prev ? s.callOrder : [...s.callOrder, callId],
  };
}

function patchRoute(s: RunView, attempt: number, routeId: number, patch: Partial<RouteView>): RunView {
  const key = routeKey(attempt, routeId);
  const prev: RouteView | undefined = s.routes[key];
  const route: RouteView = {
    key,
    routeId,
    attempt,
    steps: prev?.steps ?? null,
    stateScore: prev?.stateScore ?? null,
    validationStarted: prev?.validationStarted ?? false,
    validation: prev?.validation ?? null,
    critique: prev?.critique ?? null,
    ...patch,
  };
  return {
    ...s,
    routes: { ...s.routes, [key]: route },
    routeOrder: prev ? s.routeOrder : [...s.routeOrder, key],
  };
}

/** Fold ONE event into the view. Events must be applied in seq order. */
export function reduceEvent(state: RunView, ev: NeoEvent): RunView {
  let s = state;
  switch (ev.type) {
    case "RUN_STARTED":
      return {
        ...s,
        phase: "running",
        projectId: ev.data.project_id,
        query: ev.data.query,
        params: ev.data.params,
      };
    case "AGENT_STATUS_CHANGED":
      return patchAgent(s, ev.agent_id, () => ({
        status: ev.data.status,
        station: ev.data.station ?? null,
        currentTaskId: ev.data.current_task ?? null,
      }));
    case "TASK_CREATED":
      return patchTask(s, ev, { title: ev.data.title, attempt: ev.data.attempt, status: "PENDING" });
    case "TASK_ASSIGNED":
      return patchTask(s, ev, { agentId: ev.data.assignee, title: ev.data.title });
    case "TASK_STARTED":
      return patchTask(s, ev, { status: "RUNNING" });
    case "TASK_COMPLETED":
      return patchTask(s, ev, { status: "COMPLETED", output: ev.data.output ?? null });
    case "TASK_FAILED":
      return patchTask(s, ev, { status: "FAILED", error: ev.data.error });
    case "TOOL_REQUESTED":
      return patchCall(s, ev, ev.data.call_id, {
        tool: ev.data.tool,
        reason: ev.data.reason,
        input: ev.data.input ?? null,
        status: "REQUESTED",
      });
    case "TOOL_STARTED": {
      const id = ev.data.call_id;
      s = patchCall(s, ev, id, {
        tool: ev.data.tool,
        version: ev.data.version,
        station: ev.data.station ?? null,
        status: "RUNNING",
      });
      return patchAgent(s, ev.agent_id, (a) => ({
        activeCalls: a.activeCalls.includes(id) ? a.activeCalls : [...a.activeCalls, id],
      }));
    }
    case "TOOL_COMPLETED": {
      const id = ev.data.call_id;
      s = patchCall(s, ev, id, {
        tool: ev.data.tool,
        version: ev.data.version,
        status: "COMPLETED",
        durationMs: ev.data.duration_ms ?? null,
        summary: ev.data.summary ?? null,
      });
      return patchAgent(s, ev.agent_id, (a) => ({ activeCalls: a.activeCalls.filter((c) => c !== id) }));
    }
    case "TOOL_FAILED": {
      const id = ev.data.call_id;
      s = patchCall(s, ev, id, {
        tool: ev.data.tool,
        status: ev.data.status === "DENIED" ? "DENIED" : "FAILED",
        error: ev.data.error,
        durationMs: ev.data.duration_ms ?? null,
      });
      return patchAgent(s, ev.agent_id, (a) => ({ activeCalls: a.activeCalls.filter((c) => c !== id) }));
    }
    case "MESSAGE_SENT":
      return {
        ...s,
        messages: [
          ...s.messages,
          { seq: ev.seq, id: ev.id, from: ev.agent_id, to: ev.data.to, text: ev.data.text, ts: ev.ts },
        ],
      };
    case "MOLECULE_RECEIVED":
      return {
        ...s,
        target: { canonical_smiles: ev.data.smiles, source: ev.data.source, matched_name: ev.data.name },
      };
    case "ROUTE_GENERATED":
      s = { ...s, latestAttempt: Math.max(s.latestAttempt, ev.data.attempt) };
      return patchRoute(s, ev.data.attempt, ev.data.route_id, {
        steps: ev.data.steps,
        stateScore: ev.data.state_score,
      });
    case "VALIDATION_STARTED":
      return patchRoute(s, ev.data.attempt, ev.data.route_id, { validationStarted: true });
    case "VALIDATION_COMPLETED":
      return patchRoute(s, ev.data.attempt, ev.data.route_id, {
        validationStarted: true,
        validation: {
          assessment: ev.data.assessment,
          label: ev.data.label,
          signals: ev.data.signals ?? {},
        },
      });
    case "CRITIQUE_CREATED":
      // The critic only sees the routes of the final search attempt, and the
      // event carries no attempt - attribute it to the latest one.
      return patchRoute(s, s.latestAttempt, ev.data.route_id, {
        critique: {
          counts: ev.data.counts ?? {},
          headline: ev.data.headline,
          strengths: ev.data.strengths ?? [],
        },
      });
    case "REPLAN_STARTED":
      return {
        ...s,
        replanActive: true,
        replans: [
          ...s.replans,
          { seq: ev.seq, reason: ev.data.reason, previous: ev.data.previous, next: ev.data.next, completed: false },
        ],
      };
    case "REPLAN_COMPLETED": {
      const replans = s.replans.slice();
      const last = replans.length - 1;
      if (last >= 0) replans[last] = { ...replans[last], completed: true, next: ev.data.next };
      return { ...s, replanActive: false, replans };
    }
    case "PROJECT_COMPLETED":
      return {
        ...s,
        phase: "completed",
        outcome: {
          recommendedRouteId: ev.data.recommended_route_id ?? null,
          recommendation: ev.data.recommendation,
          routes: ev.data.routes,
        },
      };
    case "PROJECT_FAILED":
      return { ...s, phase: "failed", error: ev.data.error };
    default: {
      const exhaustive: never = ev;
      return exhaustive;
    }
  }
}

/** Merge two seq-sorted arrays, dropping duplicates by seq. */
function mergeSorted(a: NeoEvent[], b: NeoEvent[]): NeoEvent[] {
  const out: NeoEvent[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = a[i];
    const y = b[j];
    let next: NeoEvent;
    if (x !== undefined && (y === undefined || x.seq <= y.seq)) {
      next = x;
      i += 1;
    } else {
      next = y as NeoEvent;
      j += 1;
    }
    if (out.length === 0 || out[out.length - 1].seq !== next.seq) out.push(next);
  }
  return out;
}

export function foldAll(runId: string | null, events: NeoEvent[]): RunView {
  let s = emptyRun(runId);
  for (const ev of events) s = reduceEvent(s, ev);
  return { ...s, events, lastSeq: events.length ? events[events.length - 1].seq : 0 };
}

/**
 * Apply a batch of events (any order, duplicates allowed). Events for another
 * run are ignored. Appending in order is incremental; a late event with a lower
 * seq than one already applied triggers a rebuild from the sorted history, so
 * the result is always identical to folding the whole sorted stream.
 */
export function applyEvents(state: RunView, incoming: NeoEvent[]): RunView {
  if (state.runId === null) return state;
  const mine = incoming.filter((e) => e.run_id === null || e.run_id === state.runId);
  if (mine.length === 0) return state;
  const batch = mine.slice().sort((x, y) => x.seq - y.seq);
  const merged = mergeSorted(state.events, batch);
  if (merged.length === state.events.length) return state; // all duplicates

  const appendOnly = batch.every((e) => e.seq > state.lastSeq);
  if (!appendOnly) return foldAll(state.runId, merged);

  let s = state;
  let last = state.lastSeq;
  for (const ev of batch) {
    if (ev.seq <= last) continue; // duplicate inside the batch
    s = reduceEvent(s, ev);
    last = ev.seq;
  }
  return { ...s, events: merged, lastSeq: last };
}
