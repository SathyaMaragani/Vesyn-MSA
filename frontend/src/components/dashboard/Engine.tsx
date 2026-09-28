"use client";

// THE MULTI-AGENT SYNTHESIS ENGINE: the seven agents as a team, the Orchestrator above the six it coordinates.
// Every state is the model's stage state, which comes from the agents' own tasks and events; the running one pulses.
import React from "react";
import { BookOpen, Bot, FlaskConical, MessageSquareText, Network, RefreshCw, Star } from "lucide-react";
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
