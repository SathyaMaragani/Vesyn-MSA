"use client";

// THE WORKFLOW: the real LangGraph progression, drawn vertically. Each stage's state comes from its tasks and
// activity in the folded events. The replan branch is drawn as what it is (critic -> replanner -> an alternative
// route back into validation): dashed and dim until the backend actually triggers it, then solid amber, and
// travelling while a replan is running. The main path fills as stages report completion.
import React from "react";
import Link from "next/link";
import type { DashboardModel, Stage, StageState } from "@/lib/dashboard/model";
import { Section, TONE_COLOR } from "./ui";

const ROW = 62;
const TOP = 22;
const NX = 14; // node column

const MAIN = ["planner", "research", "retro", "validator", "critic", "evaluator"] as const;
const y = (i: number) => TOP + i * ROW;

const COLOR: Record<StageState, string> = {
  pending: "rgb(var(--nc-line-strong))",
  active: TONE_COLOR.run,
  done: TONE_COLOR.ok,
  warning: TONE_COLOR.warn,
  failed: TONE_COLOR.bad,
  skipped: "rgb(var(--nc-line-strong))",
};

const WORD: Record<StageState, string> = { pending: "WAITING", active: "ACTIVE", done: "DONE", warning: "DONE · FLAGGED", failed: "FAILED", skipped: "NOT NEEDED" };

function Node({ s, cy, cx = NX }: { s: StageState; cy: number; cx?: number }) {
  const c = COLOR[s];
  const NX_ = cx;
  return (
    <g>
      {s === "active" && <circle cx={NX_} cy={cy} r={11} fill="none" stroke={c} strokeWidth={1} opacity={0.5} className="nc-node-ring" />}
      {s === "done" || s === "warning" ? (
        <circle cx={NX_} cy={cy} r={5.5} fill={c} />
      ) : s === "active" ? (
        <circle cx={NX_} cy={cy} r={6} fill="rgb(var(--nc-base))" stroke={c} strokeWidth={2} />
      ) : s === "failed" ? (
        <g stroke={c} strokeWidth={2} strokeLinecap="round">
          <circle cx={NX_} cy={cy} r={6.5} fill="rgb(var(--nc-base))" />
          <path d={`M${NX_ - 3} ${cy - 3}l6 6M${NX_ + 3} ${cy - 3}l-6 6`} />
        </g>
      ) : (
        <circle cx={NX_} cy={cy} r={5} fill="rgb(var(--nc-base))" stroke={c} strokeWidth={1.5} strokeDasharray={s === "skipped" ? "2 2" : undefined} />
      )}
    </g>
  );
}

export function Workflow({ m }: { m: DashboardModel }) {
  const stage = (id: string): Stage => m.stages.find((s) => s.id === id) as Stage;
  const rp = stage("replanner");
  const height = TOP + (MAIN.length - 1) * ROW + 26;
  const W = 420;
  const bx = W - 34; // the branch's vertical
  const yV = y(3);
  const yC = y(4);
  const yR = (yV + yC) / 2;
  const RX = NX + 22 + 236 + 10; // where the rows end: the branch leaves and re-enters here
  const branchOn = m.loop.taken || m.loop.active;
  const bc = branchOn ? TONE_COLOR.warn : "rgb(var(--nc-line-strong))";

  return (
    <Section label="Agent workflow" index="02" aside={<span>{m.progress.pct === null ? "no run" : `${m.progress.done}/${m.progress.total} stages`}</span>}>
      <div className="relative" style={{ height, width: W, maxWidth: "100%" }}>
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="absolute inset-0 overflow-visible" aria-hidden>
          {/* the spine: grey underneath, filled with the state of the stage it leaves */}
          {MAIN.slice(0, -1).map((id, i) => {
            const s = stage(id).state;
            const next = stage(MAIN[i + 1]).state;
            const lit = s === "done" || s === "warning";
            const flowing = lit && next === "active";
            return (
              <g key={id}>
                <line x1={NX} x2={NX} y1={y(i) + 8} y2={y(i + 1) - 8} stroke="rgb(var(--nc-line))" strokeWidth={2} />
                {lit && <line x1={NX} x2={NX} y1={y(i) + 8} y2={y(i + 1) - 8} stroke={COLOR[s]} strokeWidth={2} strokeDasharray={flowing ? "3 5" : undefined} className={flowing ? "nc-flow" : undefined} />}
              </g>
            );
          })}

          {/* the replan branch: critic -> replanner -> alternative route -> validation */}
          <path
            d={`M${RX} ${yC} H${bx - 22} Q${bx} ${yC} ${bx} ${yC - 22} V${yV + 22} Q${bx} ${yV} ${bx - 22} ${yV} H${RX + 6}`}
            fill="none"
            stroke={bc}
            strokeWidth={branchOn ? 1.6 : 1.1}
            strokeDasharray={m.loop.active ? "4 5" : branchOn ? undefined : "2 5"}
            className={m.loop.active ? "nc-flow" : undefined}
            opacity={branchOn ? 1 : 0.7}
          />
          <path d={`M${RX - 2} ${yV} l8 -4 v8z`} fill={bc} opacity={branchOn ? 1 : 0.7} />
          <Node s={rp.state} cy={yR} cx={bx} />
        </svg>

        {/* the replanner sits on the branch */}
        <div className="absolute" style={{ left: bx - 96, top: yR - 8, width: 84, textAlign: "right" }}>
          <div className="font-data text-[10px] uppercase tracking-[0.14em]" style={{ color: branchOn ? TONE_COLOR.warn : "rgb(var(--nc-lo))" }}>replanner</div>
        </div>
        <div className="absolute whitespace-nowrap font-data text-[8px] uppercase tracking-[0.08em] text-nc-lo" style={{ left: RX + 8, top: yV - 18, width: bx - RX - 4, textAlign: "left", color: branchOn ? TONE_COLOR.warn : undefined }}>
          alternative route
        </div>

        {MAIN.map((id, i) => {
          const s = stage(id);
          return (
            <Link key={id} href={`/lab/${id === "research" ? "evidence" : id === "critic" ? "intelligence" : id === "planner" ? "audit" : "routes"}`} className="nc-focus group absolute" style={{ left: NX + 22, top: y(i) - 13, width: 236 }}>
              <div className="flex items-baseline gap-2.5">
                <span className="font-data text-[10px] tabular-nums text-nc-lo">{String(["planner", "research", "retro", "validator", "replanner", "critic", "evaluator"].indexOf(id)).padStart(2, "0")}</span>
                <span className="font-data text-[13px] uppercase tracking-[0.12em] text-nc-hi group-hover:text-nc-cyan" style={{ opacity: s.state === "pending" ? 0.55 : 1 }}>{s.label}</span>
                <span className="ml-auto font-data text-[9px] uppercase tracking-[0.14em]" style={{ color: COLOR[s.state] }}>{s.state === "pending" && !m.hasRun ? "" : WORD[s.state]}</span>
              </div>
              <div className="mt-0.5 truncate pl-[26px] font-data text-[10px] text-nc-lo" title={s.detail ?? undefined}>{s.detail ?? (m.hasRun ? "" : "")}</div>
            </Link>
          );
        })}
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
          {MAIN.map((id, i) => (
            <Node key={id} s={stage(id).state} cy={y(i)} />
          ))}
        </svg>
      </div>

      <div className="mt-4 border-t border-nc-line pt-3 font-data text-[10px] leading-relaxed text-nc-lo">
        {m.loop.taken || m.loop.active ? (
          <span style={{ color: TONE_COLOR.warn }}>
            {m.loop.active ? "REPLANNING NOW" : `REPLANNED ×${m.loop.count}`}
            <span className="text-nc-mid"> — {m.loop.reason ?? "no reason reported"}</span>
          </span>
        ) : m.hasRun ? (
          <span>{rp.state === "skipped" ? "The replan branch was not needed: no route was flagged for review." : "The replan branch is armed. It fires only when no route is usable (every route flagged for review), up to 3 search attempts."}</span>
        ) : (
          <span>If validation fails, the run branches: critic → replanner → an alternative route → validation again.</span>
        )}
      </div>
    </Section>
  );
}
