"use client";

// What the team is doing, in words rather than logs. One row per agent, in the order they work, with
// memory inserted where it happens - between profiling the target and generating routes.
//
// Every state comes from the model's stage states, which come from the agents' own tasks and events.
// A row says "Waiting" only because nothing has reported yet, never to fill the line.
import React from "react";
import { Check, X } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import type { DashboardModel, StageState } from "@/lib/dashboard/model";
import { TONE_COLOR } from "./ui";
import { lessonOf } from "@/lib/mobile/assistant";

/** The plain-words version of each agent's work, by what its tasks report. */
const SAYS: Record<string, Partial<Record<StageState, string>> & { pending: string }> = {
  planner: { pending: "Waiting", active: "Reading the question…", done: "Plan ready", failed: "Could not plan" },
  research: { pending: "Waiting", active: "Profiling the target…", done: "Target profiled", failed: "Profile failed" },
  retro: { pending: "Waiting", active: "Generating candidate routes…", done: "Candidate routes generated", failed: "No routes generated" },
  validator: {
    pending: "Waiting",
    active: "Checking each transformation…",
    done: "Every transformation checked",
    warning: "Flagged a transformation",
    failed: "Validation failed",
  },
  critic: { pending: "Waiting", active: "Comparing the routes…", done: "Routes compared", failed: "Critique failed" },
  replanner: { pending: "Waiting", active: "Widening the search…", done: "Search widened", skipped: "Not needed" },
  evaluator: { pending: "Waiting", active: "Choosing the best route…", done: "Best route chosen", failed: "Could not choose" },
};

const NAME: Record<string, string> = {
  planner: "Orchestrator",
  research: "Researcher",
  retro: "Retrosynthesis",
  validator: "Validator",
  critic: "Critic",
  replanner: "Replanner",
  evaluator: "Evaluator",
};

function Mark({ state }: { state: StageState }) {
  if (state === "done")
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border" style={{ borderColor: TONE_COLOR.ok, color: TONE_COLOR.ok }}>
        <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "failed")
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border" style={{ borderColor: TONE_COLOR.bad, color: TONE_COLOR.bad }}>
        <X className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  if (state === "warning")
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border font-data text-[10px] font-bold" style={{ borderColor: TONE_COLOR.warn, color: TONE_COLOR.warn }}>
        !
      </span>
    );
  if (state === "active")
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center" aria-hidden>
        <span className="nc-pulse h-2 w-2 rounded-full" style={{ background: TONE_COLOR.run }} />
      </span>
    );
  return <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center"><span className="h-1.5 w-1.5 rounded-full bg-nc-line-strong" /></span>;
}

function Line({ name, state, says, lit = false }: { name: string; state: StageState; says: string; lit?: boolean }) {
  const colour = state === "active" ? TONE_COLOR.run : state === "pending" || state === "skipped" ? TONE_COLOR.dim : "rgb(var(--nc-mid))";
  return (
    <li className={cx("flex items-center gap-2.5 py-[5px]", lit && "m-memory-pulse rounded-lg px-1.5")}>
      <Mark state={state} />
      <span className="w-[86px] shrink-0 truncate text-[12px] text-nc-hi">{name}</span>
      <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: colour }}>
        {says}
      </span>
    </li>
  );
}

/** The memory row's own state: what Hindsight gave this run, which is not an agent's task. */
function memoryLine(m: DashboardModel): { state: StageState; says: string } {
  const mem = m.memory;
  if (!mem.reported) return { state: mem.pending ? "active" : "skipped", says: mem.pending ? "Searching previous research…" : "Not used in this run" };
  if (mem.error) return { state: "failed", says: "Memory unreachable — continued without it" };
  if (mem.recalled === null) return { state: "active", says: "Searching previous research…" };
  if (mem.recalled === 0) return { state: "done", says: "No previous experience found" };
  const applied = mem.applied ? new Set(mem.applied.map((a) => lessonOf(a.issue))).size : null;
  if (applied === null) return { state: "done", says: `${mem.recalled} experiences recalled` };
  return {
    state: applied > 0 ? "warning" : "done",
    says: applied > 0 ? `${applied} relevant experience${applied === 1 ? "" : "s"} applied` : `${mem.recalled} recalled · none applied here`,
  };
}

export function AgentProgress({ m }: { m: DashboardModel }) {
  const mem = memoryLine(m);
  const stage = (id: string) => m.stages.find((s) => s.id === id);
  const rows: React.ReactNode[] = [];
  const push = (id: string) => {
    const s = stage(id);
    if (!s) return;
    if (id === "replanner" && s.state === "skipped" && m.phase !== "running") return; // a replan that never happened is not a step
    rows.push(<Line key={id} name={NAME[id] ?? id} state={s.state} says={SAYS[id]?.[s.state] ?? SAYS[id]?.pending ?? "Waiting"} />);
  };

  push("planner");
  push("research");
  rows.push(<Line key="memory" name="Memory" state={mem.state} says={mem.says} lit={(m.memory.applied?.length ?? 0) > 0} />);
  push("retro");
  push("validator");
  push("critic");
  push("replanner");
  push("evaluator");

  return (
    <div className="m-card px-3 py-2">
      <ul className="divide-y divide-nc-line/60">{rows}</ul>
    </div>
  );
}
