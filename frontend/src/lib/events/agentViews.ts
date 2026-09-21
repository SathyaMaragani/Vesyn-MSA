// What each agent shows in the office, rail and inspector. Every field comes
// from the backend: the roster snapshot (GET /api/agents) or the folded events.
import { KNOWN_AGENT_IDS } from "../../types/agents.ts";
import type { Activity, AgentSnapshot, AgentStatus, Station } from "../../types/agents.ts";
import type { ApiHealth } from "../../types/api.ts";
import { deriveActivity } from "./activity.ts";
import type { RunView, TaskView, ToolCallView } from "./fold.ts";

export interface AgentView {
  id: string;
  name: string;
  /** null = the backend has not told us (offline, or the roster call failed). */
  role: string | null;
  station: Station | null;
  status: AgentStatus | "UNKNOWN";
  activity: Activity;
  currentTask: TaskView | null;
  /** Tool calls genuinely in flight. Empty once the run has ended. */
  activeCalls: ToolCallView[];
  /** Calls that started but never reported completion before the run ended (e.g. aborted by a failure elsewhere). */
  unfinishedCalls: ToolCallView[];
}

/**
 * Status source, in order of authority:
 *  - API offline                      -> UNKNOWN (we cannot know)
 *  - a run is selected and has events -> the folded events (an agent with no
 *    events in this run did nothing in it: IDLE)
 *  - a run is selected, no events yet -> UNKNOWN (replay has not arrived)
 *  - no run selected                  -> the live roster snapshot
 */
export function buildAgentViews(input: {
  roster: readonly AgentSnapshot[] | null;
  run: RunView;
  health: ApiHealth;
}): AgentView[] {
  const { roster, run, health } = input;
  const ids: string[] = [...KNOWN_AGENT_IDS];
  for (const a of roster ?? []) if (!ids.includes(a.id)) ids.push(a.id);
  for (const id of Object.keys(run.agents)) if (!ids.includes(id)) ids.push(id);

  const runHasEvents = run.runId !== null && run.events.length > 0;

  return ids.map((id): AgentView => {
    const snap = roster?.find((a) => a.id === id) ?? null;
    const live = run.agents[id] ?? null;

    let status: AgentStatus | "UNKNOWN";
    if (health === "offline") status = "UNKNOWN";
    else if (runHasEvents) status = live?.status ?? "IDLE";
    else if (run.runId !== null) status = "UNKNOWN";
    else status = snap?.status ?? "UNKNOWN";

    const started = (runHasEvents ? (live?.activeCalls ?? []) : [])
      .map((c) => run.calls[c])
      .filter((c): c is ToolCallView => c !== undefined);
    const ended = run.phase === "completed" || run.phase === "failed";
    const activeCalls = ended ? [] : started;
    const unfinishedCalls = ended ? started : [];

    // The backend resets every agent to IDLE when a run ends, which would erase
    // the evidence of a failure. A TASK_FAILED in this run's events keeps the
    // agent flagged until another run is selected.
    const failedTask = runHasEvents
      ? Object.values(run.tasks).find((t) => t.agentId === id && t.status === "FAILED")
      : undefined;

    return {
      id,
      name: snap?.name ?? id,
      role: snap?.role ?? null,
      station: live?.station ?? snap?.station ?? null,
      status,
      activity: failedTask && status === "IDLE"
        ? "failed"
        : deriveActivity({
            status,
            agentId: id,
            activeTools: activeCalls.map((c) => c.tool),
            replanActive: run.replanActive,
          }),
      currentTask: live?.currentTaskId ? (run.tasks[live.currentTaskId] ?? null) : (failedTask ?? null),
      activeCalls,
      unfinishedCalls,
    };
  });
}
