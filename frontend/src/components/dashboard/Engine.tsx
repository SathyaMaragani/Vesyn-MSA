"use client";

// THE MULTI-AGENT SYNTHESIS ENGINE and THE SYNTHESIS PIPELINE: the same seven agents drawn two ways - as the team
// (the Orchestrator above the six it coordinates) and as the order the work flows in. Every state is the model's
// stage state, which comes from the agents' own tasks and events; the running one pulses.
import React from "react";
import { BookOpen, Bot, ChevronRight, FlaskConical, MessageSquareText, Network, RefreshCw, Star, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DashboardModel, Stage, StageState } from "@/lib/dashboard/model";
import type { Tone } from "@/lib/events/activity";
import { cx } from "@/components/ui/primitives";
import { Card, StatusPill } from "./ui";

export const AGENT_META: Record<string, { name: string; blurb: string; Icon: LucideIcon }> = {
  planner: { name: "Orchestrator", blurb: "Plans and coordinates", Icon: Bot },
  research: { name: "Research", blurb: "Profiles the target", Icon: BookOpen },
  retro: { name: "Retrosynthesis", blurb: "Generates routes", Icon: Network },
  validator: { name: "Validation", blurb: "Checks feasibility", Icon: FlaskConical },
  critic: { name: "Critic", blurb: "Evaluates routes", Icon: MessageSquareText },
  replanner: { name: "Replanner", blurb: "Widens the search", Icon: RefreshCw },
  evaluator: { name: "Evaluator", blurb: "Selects the best route", Icon: Star },
};

const TEAM = ["research", "retro", "validator", "critic", "replanner", "evaluator"] as const;

export function stagePill(state: StageState | undefined): { text: string; tone: Tone; live: boolean } {
  switch (state) {
    case "done":
      return { text: "Done", tone: "ok", live: false };
    case "active":
      return { text: "Running", tone: "run", live: true };
    case "warning":
      return { text: "Flagged", tone: "warn", live: false };
    case "failed":
      return { text: "Failed", tone: "bad", live: false };
    case "skipped":
      return { text: "Skipped", tone: "dim", live: false };
    default:
      return { text: "Waiting", tone: "dim", live: false };
  }
}

const lit = (s: StageState | undefined) => s === "done" || s === "active" || s === "warning";

export function Orb({ Icon, state, size = 56 }: { Icon: LucideIcon; state: StageState | undefined; size?: number }) {
  return (
    <span className={cx("nc-orb shrink-0", !lit(state) && "nc-orb-dim", state === "active" && "nc-orb-live")} style={{ width: size, height: size }}>
      <Icon className={lit(state) ? "text-nc-cyan" : "text-nc-lo"} style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.6} aria-hidden />
    </span>
  );
}

const byId = (stages: Stage[]) => new Map(stages.map((s) => [s.id as string, s]));

export function Engine({ m }: { m: DashboardModel }) {
  const stages = byId(m.stages);
  const planner = stages.get("planner");
  const pp = stagePill(planner?.state);
  const running = m.phase === "running";
  return (
    <Card
      title="Multi-agent synthesis engine"
      aside={
        <>
          <span className="nc-chip">{TEAM.length + 1} agents</span>
          <StatusPill tone={m.statusTone} live={running}>{m.hasRun ? m.statusWord.charAt(0) + m.statusWord.slice(1).toLowerCase() : "No run"}</StatusPill>
        </>
      }
    >
      <div className="relative mx-auto h-[272px] max-w-[640px]">
        {/* the lines from the Orchestrator to each agent; the running agent's line is lit */}
        <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 600 272" preserveAspectRatio="none">
          {TEAM.map((id, i) => {
            const x = (i + 0.5) * 100;
            const s = stages.get(id)?.state;
            return (
              <path
                key={id}
                d={`M300 74 C300 108 ${x} 96 ${x} 130`}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={s === "active" ? 2 : 1.3}
                stroke={lit(s) ? "rgb(var(--nc-cyan))" : "rgb(var(--nc-line-strong))"}
                strokeOpacity={s === "active" ? 1 : lit(s) ? 0.7 : 1}
                strokeDasharray={s === "active" ? "5 5" : undefined}
                className={s === "active" ? "nc-flow" : undefined}
              />
            );
          })}
        </svg>

        <div className="absolute left-1/2 top-2 flex -translate-x-[32px] items-center gap-3">
          <Orb Icon={AGENT_META.planner.Icon} state={planner?.state} size={64} />
          <div className="min-w-[150px]">
            <div className="text-[15px] font-medium text-nc-hi">{AGENT_META.planner.name}</div>
            <div className="text-[11.5px] text-nc-lo">{AGENT_META.planner.blurb}</div>
            <div className="mt-1.5">
              <StatusPill tone={pp.tone} live={pp.live}>{pp.text}</StatusPill>
            </div>
          </div>
        </div>

        <ol className="absolute inset-x-0 top-[130px] grid grid-cols-6">
          {TEAM.map((id) => {
            const s = stages.get(id);
            const p = stagePill(s?.state);
            const meta = AGENT_META[id];
            return (
              <li key={id} className="flex flex-col items-center text-center" title={s?.detail ?? undefined}>
                <Orb Icon={meta.Icon} state={s?.state} />
                <div className="mt-2 text-[12.5px] font-medium text-nc-hi">{meta.name}</div>
                {/* two lines reserved, so every pill sits on one baseline whatever the blurb's length */}
                <div className="line-clamp-2 h-[27px] px-1 text-[10.5px] leading-[13px] text-nc-lo">{meta.blurb}</div>
                <div className="mt-1.5">
                  <StatusPill tone={p.tone} live={p.live}>{p.text}</StatusPill>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

/** The order the work flows in, left to right, starting from the target the Orchestrator resolved. */
const FLOW: { id: string; name: string; blurb: string; Icon: LucideIcon }[] = [
  { id: "target", name: "Target", blurb: "Input molecule", Icon: Target },
  { id: "research", name: "Research", blurb: "Gather information", Icon: BookOpen },
  { id: "retro", name: "Retrosynthesis", blurb: "Generate routes", Icon: Network },
  { id: "validator", name: "Validation", blurb: "Check feasibility", Icon: FlaskConical },
  { id: "critic", name: "Critic", blurb: "Evaluate & critique", Icon: MessageSquareText },
  { id: "replanner", name: "Replanner", blurb: "Widen the search", Icon: RefreshCw },
  { id: "evaluator", name: "Evaluation", blurb: "Select best route", Icon: Star },
];

export function Pipeline({ m }: { m: DashboardModel }) {
  const stages = byId(m.stages);
  return (
    <Card title="Synthesis pipeline" aside={m.hasRun ? <span className="font-data text-[10.5px] text-nc-lo">{m.progress.done} of {m.progress.total} stages reported done</span> : undefined}>
      <ol className="flex items-start justify-between gap-1 overflow-x-auto pb-1 pt-1">
        {FLOW.map((f, i) => {
          const state: StageState | undefined = f.id === "target" ? (m.target.smiles ? "done" : "pending") : stages.get(f.id)?.state;
          return (
            <React.Fragment key={f.id}>
              {i > 0 && <ChevronRight aria-hidden className={cx("mt-3.5 h-4 w-4 shrink-0", lit(state) ? "text-nc-cyan" : "text-nc-line-strong")} />}
              <li className="flex min-w-[96px] flex-col items-center text-center" title={stages.get(f.id)?.detail ?? undefined}>
                <Orb Icon={f.Icon} state={state} size={44} />
                <div className={cx("mt-2 text-[12.5px] font-medium", state === "skipped" ? "text-nc-lo" : "text-nc-hi")}>{f.name}</div>
                <div className="text-[10.5px] text-nc-lo">{state === "skipped" ? "Not needed" : f.blurb}</div>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </Card>
  );
}
