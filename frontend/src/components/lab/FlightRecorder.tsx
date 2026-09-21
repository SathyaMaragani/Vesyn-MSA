"use client";

// The bottom dock: the camera, and the FLIGHT RECORDER.
//
// Collapsed it is one quiet line: the current event, the six ways of pointing the camera, and a handle.
// Expanded it is a scientific investigation timeline of the run's REAL event log: one lane per
// department, one tick per event, coloured by what the event was. Choosing a tick replays the run as it
// stood after that event (the whole facility rewinds to that moment; nothing is simulated), and
// "return to live" comes back. Below it the run reads as its chapters: RUN STARTED -> PLANNER -> RESEARCH ...
import React, { useMemo, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { TONE_TEXT, cx } from "@/components/ui/primitives";
import { describeEvent } from "@/lib/events/describe";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";
import { ZONES } from "@/components/facility/layout";
import type { NeoEvent } from "@/types/events";

const QUIET = new Set(["AGENT_STATUS_CHANGED", "TOOL_REQUESTED", "TASK_ASSIGNED", "TASK_CREATED"]);
const LANES = ["planner", "research", "retro", "validator", "critic", "replanner", "evaluator"] as const;
const TONE_FILL: Record<string, string> = {
  run: "rgb(var(--nc-cyan))",
  ok: "rgb(var(--nc-ok))",
  warn: "rgb(var(--nc-warn))",
  bad: "rgb(var(--nc-bad))",
  idle: "rgb(var(--nc-lo))",
  dim: "rgb(var(--nc-lo))",
};

const STATUS: Record<string, { word: string; cls: string }> = {
  ok: { word: "OK", cls: "text-nc-ok" },
  bad: { word: "FAILED", cls: "text-nc-bad" },
  warn: { word: "WARN", cls: "text-nc-warn" },
  run: { word: "RUNNING", cls: "text-nc-cyan" },
  idle: { word: "·", cls: "text-nc-lo" },
  dim: { word: "·", cls: "text-nc-lo" },
};

/** HH:MM:SS.mmm of an event's timestamp (local), or "not reported". */
function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "not reported";
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** The tool an event concerns, when it concerns one. */
function toolOf(ev: NeoEvent): string {
  const d = ev.data as unknown as { tool?: unknown };
  return typeof d.tool === "string" ? d.tool : "—";
}

function Seg({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cx("nc-focus h-6 px-2.5 font-data text-[10px] uppercase tracking-wider", active ? "bg-nc-cyan/15 text-nc-cyan" : "text-nc-lo hover:text-nc-mid")}
    >
      {children}
    </button>
  );
}

/** The run's chapters: consecutive events by the same agent collapse into one chip. */
function chapters(events: readonly NeoEvent[]): { label: string; seq: number; agent: string | null }[] {
  const out: { label: string; seq: number; agent: string | null }[] = [];
  for (const ev of events) {
    if (ev.type === "RUN_STARTED") out.push({ label: "RUN STARTED", seq: ev.seq, agent: null });
    else if (ev.type === "PROJECT_COMPLETED") out.push({ label: "COMPLETED", seq: ev.seq, agent: null });
    else if (ev.type === "PROJECT_FAILED") out.push({ label: "RUN FAILED", seq: ev.seq, agent: null });
    else if (ev.type === "REPLAN_STARTED") out.push({ label: "REPLAN", seq: ev.seq, agent: "replanner" });
    else if (ev.agent_id && !QUIET.has(ev.type)) {
      const last = out[out.length - 1];
      if (!last || last.agent !== ev.agent_id) out.push({ label: (ZONES as Record<string, { title: string }>)[ev.agent_id]?.title ?? ev.agent_id.toUpperCase(), seq: ev.seq, agent: ev.agent_id });
    }
  }
  return out;
}

export function FlightRecorder() {
  const { run, runId, health, apiBase, cursor, setCursor, liveRun } = useNeo();
  const ui = useLabUI();
  const [hover, setHover] = useState<NeoEvent | null>(null);
  const [view, setView] = useState<"timeline" | "log">("timeline");

  const events = liveRun.events;
  const shown = useMemo(() => events.filter((e) => !QUIET.has(e.type)), [events]);
  const chips = useMemo(() => chapters(events), [events]);

  let current: NeoEvent | null = null;
  for (let i = run.events.length - 1; i >= 0; i--) {
    if (!QUIET.has(run.events[i].type)) {
      current = run.events[i];
      break;
    }
  }
  const line = hover ? describeEvent(hover) : current ? describeEvent(current) : null;
  const free = ui.preset === "free" && ui.focus === null && ui.mode === "free";
  const open = ui.recorderOpen;

  const scrub = (ev: NeoEvent) => {
    setCursor(ev.seq === liveRun.lastSeq ? null : ev.seq);
    if (ev.agent_id && ev.agent_id in ZONES) ui.focusAgent(ev.agent_id);
  };

  return (
    <footer className={cx("pointer-events-auto absolute inset-x-0 bottom-0 z-30 border-t border-nc-line backdrop-blur-md", open ? "bg-nc-base/95" : "bg-nc-base/82")}>
      {open && (
        <div className="border-b border-nc-line px-3 pb-2 pt-2">
          <div className="mb-2 flex items-center gap-3">
            <span className="nc-label">Flight recorder</span>
            <span className="font-data text-[10px] text-nc-lo">
              {events.length} events · seq {liveRun.lastSeq}
            </span>
            {cursor !== null && (
              <button type="button" onClick={() => setCursor(null)} className="nc-focus border border-nc-cyan/60 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider text-nc-cyan hover:bg-nc-cyan/10">
                Return to live
              </button>
            )}
            <div className="flex items-center gap-px border border-nc-line" role="group" aria-label="Recorder view">
              <Seg active={view === "timeline"} onClick={() => setView("timeline")}>
                Timeline
              </Seg>
              <Seg active={view === "log"} onClick={() => setView("log")}>
                Log
              </Seg>
            </div>
            <span className="ml-auto font-data text-[10px] text-nc-lo">choose an event: the facility replays to that moment and the camera goes to its station</span>
          </div>

          {shown.length === 0 ? (
            <div className="py-6 text-center font-data text-[11px] text-nc-lo">{runId ? "no events recorded for this run yet" : "no run selected"}</div>
          ) : (
            <>
              {view === "log" && (
                <div className="max-h-44 overflow-y-auto border border-nc-line">
                  <table className="w-full border-collapse font-data text-[10px]">
                    <thead className="sticky top-0 bg-nc-base/95 text-left uppercase tracking-wider text-nc-lo">
                      <tr>
                        <th className="px-2 py-1 font-normal">#</th>
                        <th className="px-2 py-1 font-normal">Time</th>
                        <th className="px-2 py-1 font-normal">Agent</th>
                        <th className="px-2 py-1 font-normal">Event</th>
                        <th className="px-2 py-1 font-normal">Tool</th>
                        <th className="px-2 py-1 font-normal">Status</th>
                        <th className="px-2 py-1 font-normal">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((ev) => {
                        const d = describeEvent(ev);
                        const st = STATUS[d.tone] ?? STATUS.idle;
                        const sel = cursor === ev.seq || (cursor === null && ev.seq === liveRun.lastSeq);
                        return (
                          <tr
                            key={ev.seq}
                            onClick={() => scrub(ev)}
                            onMouseEnter={() => setHover(ev)}
                            onMouseLeave={() => setHover(null)}
                            className={cx("cursor-pointer border-t border-nc-line/60 hover:bg-nc-cyan/10", sel && "bg-nc-cyan/10", cursor !== null && ev.seq > cursor && "opacity-40")}
                          >
                            <td className="px-2 py-0.5 text-nc-lo">{ev.seq}</td>
                            <td className="whitespace-nowrap px-2 py-0.5 text-nc-mid">{clock(ev.ts)}</td>
                            <td className="whitespace-nowrap px-2 py-0.5 text-nc-hi">{ev.agent_id ? ((ZONES as Record<string, { title: string }>)[ev.agent_id]?.title ?? ev.agent_id) : "SYSTEM"}</td>
                            <td className="whitespace-nowrap px-2 py-0.5 text-nc-mid">{ev.type}</td>
                            <td className="whitespace-nowrap px-2 py-0.5 text-nc-mid">{toolOf(ev)}</td>
                            <td className={cx("whitespace-nowrap px-2 py-0.5", st.cls)}>{st.word}</td>
                            <td className="max-w-[26rem] truncate px-2 py-0.5 text-nc-lo" title={d.text}>
                              {d.text}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {view === "timeline" && (
              <>
              <div className="flex flex-wrap gap-1 pb-2">
                {chips.map((c, i) => (
                  <button
                    key={`${c.seq}-${i}`}
                    type="button"
                    onClick={() => {
                      const ev = events.find((e) => e.seq === c.seq);
                      if (ev) scrub(ev);
                    }}
                    className="nc-focus border border-nc-line px-1.5 py-0.5 font-data text-[9px] uppercase tracking-[0.14em] text-nc-mid hover:border-nc-cyan/50 hover:text-nc-hi"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="relative overflow-x-auto">
                <svg width={Math.max(shown.length * 11 + 90, 600)} height={LANES.length * 16 + 6} className="block" role="img" aria-label="Event timeline by department">
                  {LANES.map((l, i) => (
                    <g key={l}>
                      <line x1={84} x2="100%" y1={i * 16 + 10} y2={i * 16 + 10} stroke="rgb(var(--nc-line))" />
                      <text x={0} y={i * 16 + 13} fontSize="8" letterSpacing="1.5" fill="rgb(var(--nc-lo))" fontFamily="var(--nc-font-data)">
                        {ZONES[l].title.slice(0, 13)}
                      </text>
                    </g>
                  ))}
                  {shown.map((ev, i) => {
                    const lane = ev.agent_id ? LANES.indexOf(ev.agent_id as (typeof LANES)[number]) : -1;
                    const y = (lane < 0 ? 0 : lane) * 16 + 10;
                    const d = describeEvent(ev);
                    const past = cursor !== null && ev.seq > cursor;
                    return (
                      <g key={ev.seq} onMouseEnter={() => setHover(ev)} onMouseLeave={() => setHover(null)} onClick={() => scrub(ev)} className="cursor-pointer">
                        <rect x={88 + i * 11 - 5} y={y - 7} width={11} height={14} fill="transparent" />
                        <circle cx={92 + i * 11} cy={y} r={ev.type === "PROJECT_FAILED" || ev.type === "TOOL_FAILED" ? 4 : 3} fill={TONE_FILL[d.tone] ?? TONE_FILL.idle} opacity={past ? 0.25 : 0.95} />
                      </g>
                    );
                  })}
                  {cursor !== null &&
                    (() => {
                      const idx = shown.filter((e) => e.seq <= cursor).length - 1;
                      return idx >= 0 ? <line x1={92 + idx * 11} x2={92 + idx * 11} y1={0} y2={LANES.length * 16} stroke="rgb(var(--nc-warn))" strokeWidth="1" /> : null;
                    })()}
                </svg>
              </div>
              </>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex h-10 items-center gap-4 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="nc-label shrink-0">{hover ? `Event #${hover.seq}` : cursor !== null ? `Replay #${cursor}` : "Current event"}</span>
          {line ? (
            <span className="truncate text-[12px]" title={line.text}>
              <span className={cx("mr-2 font-data text-[10px] tracking-wider", TONE_TEXT[line.tone])}>{line.tag}</span>
              <span className="text-nc-mid">{line.text}</span>
            </span>
          ) : (
            <span className="font-data text-[11px] text-nc-lo">{health === "offline" ? "API offline" : runId ? "waiting for events…" : "no run selected"}</span>
          )}
        </div>

        <div className="flex items-center gap-px border border-nc-line" role="group" aria-label="Camera">
          <Seg active={free} onClick={ui.goFree} title="Drag to orbit, right-drag to pan, wheel to zoom">
            Free view
          </Seg>
          <Seg active={ui.preset === "overview" && ui.focus === null && ui.mode === "free"} onClick={() => ui.setPreset("overview")} title="O">
            Overview
          </Seg>
          <Seg active={ui.preset === "flow" && ui.focus === null && ui.mode === "free"} onClick={() => ui.setPreset("flow")}>
            Flow
          </Seg>
          <Seg active={ui.mode === "follow"} onClick={() => ui.setMode(ui.mode === "follow" ? "free" : "follow")} title="F — the camera goes where the backend says the work is">
            Follow workflow
          </Seg>
          <span className="mx-1 h-4 w-px bg-nc-line" />
          <Seg active={ui.focus?.kind === "molecule" || ui.focus?.kind === "core"} onClick={ui.focusMolecule} title="M">
            Molecule
          </Seg>
          <Seg active={ui.focus?.kind === "route"} onClick={ui.focusRoute} title="R">
            Route
          </Seg>
        </div>

        <div className="hidden shrink-0 items-center gap-4 font-data text-[10px] text-nc-lo lg:flex">
          <span title="1–7 focus a department">1–7 · O · M · R · F · H</span>
          <span className={health === "offline" ? "text-nc-bad" : undefined}>{apiBase}</span>
        </div>

        <button
          type="button"
          onClick={() => ui.setRecorderOpen(!open)}
          aria-expanded={open}
          className={cx("nc-focus flex h-6 items-center gap-1.5 border px-2.5 font-data text-[10px] uppercase tracking-wider", open ? "border-nc-cyan/60 text-nc-cyan" : "border-nc-line text-nc-mid hover:text-nc-hi")}
        >
          Flight recorder {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
      </div>
    </footer>
  );
}
