"use client";

import React, { useMemo } from "react";
import { TONE_TEXT } from "@/components/ui/primitives";
import type { Tone } from "@/lib/events/activity";
import { describeEvent } from "@/lib/events/describe";
import { WORKFLOW_ORDER } from "@/lib/events/presentation";
import type { NeoEvent } from "@/types/events";

const LANES: readonly string[] = [...WORKFLOW_ORDER, "system"];
const LANE_H = 26;
const LEFT = 92;
const TONE_FILL: Record<Tone, string> = {
  dim: "rgb(var(--nc-lo))",
  idle: "rgb(var(--nc-mid))",
  run: "rgb(var(--nc-cyan))",
  warn: "rgb(var(--nc-warn))",
  ok: "rgb(var(--nc-ok))",
  bad: "rgb(var(--nc-bad))",
};

function clock(ts: string, t0: number): string {
  const s = Math.max(0, Math.round((Date.parse(ts) - t0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The investigation at a glance: one lane per agent, one glyph per meaningful
 * event, in the order they happened (spacing is by sequence, not wall time, so a
 * fast run stays legible). Messages draw a link between the two lanes involved.
 */
export function Swimlane({ events, selectedSeq, onSelect }: { events: NeoEvent[]; selectedSeq: number | null; onSelect: (ev: NeoEvent) => void }) {
  const step = Math.min(34, Math.max(14, 900 / Math.max(events.length, 1)));
  const width = LEFT + events.length * step + 30;
  const height = LANES.length * LANE_H + 24;
  const t0 = events.length ? Date.parse(events[0].ts) : 0;
  const laneOf = (id: string | null) => Math.max(0, LANES.indexOf(id ?? "system") === -1 ? LANES.length - 1 : LANES.indexOf(id ?? "system"));

  const glyphs = useMemo(
    () =>
      events.map((ev, i) => {
        const x = LEFT + 12 + i * step;
        const y = laneOf(ev.agent_id) * LANE_H + LANE_H / 2;
        return { ev, x, y, tone: describeEvent(ev).tone };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, step],
  );

  return (
    <div className="overflow-x-auto border-b border-nc-line bg-nc-base/60">
      <svg width={width} height={height} role="group" aria-label="Flight recorder timeline">
        {LANES.map((l, i) => (
          <g key={l}>
            <line x1={LEFT} x2={width - 10} y1={i * LANE_H + LANE_H / 2} y2={i * LANE_H + LANE_H / 2} stroke="rgb(var(--nc-line))" strokeWidth={1} />
            <text x={8} y={i * LANE_H + LANE_H / 2 + 3.5} fontSize="10" fill="rgb(var(--nc-lo))" fontFamily="var(--nc-font-data)" className="uppercase">
              {l}
            </text>
          </g>
        ))}
        {glyphs.map(({ ev, x, y }) =>
          ev.type === "MESSAGE_SENT" ? (
            <line key={`l${ev.seq}`} x1={x} x2={x} y1={y} y2={laneOf(ev.data.to) * LANE_H + LANE_H / 2} stroke="rgb(var(--nc-cyan))" strokeOpacity={0.35} strokeWidth={1.2} />
          ) : null,
        )}
        {glyphs.map(({ ev, x, y, tone }) => {
          const fill = TONE_FILL[tone];
          const sel = selectedSeq === ev.seq;
          let shape: React.ReactNode;
          switch (ev.type) {
            case "TOOL_STARTED":
            case "TOOL_COMPLETED":
            case "TOOL_FAILED":
              shape = <rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill={fill} />;
              break;
            case "VALIDATION_STARTED":
            case "VALIDATION_COMPLETED":
              shape = <rect x={x - 4.5} y={y - 4.5} width={9} height={9} fill={fill} transform={`rotate(45 ${x} ${y})`} />;
              break;
            case "CRITIQUE_CREATED":
              shape = <polygon points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} fill={fill} />;
              break;
            case "REPLAN_STARTED":
            case "REPLAN_COMPLETED":
              shape = <circle cx={x} cy={y} r={5} fill="none" stroke={fill} strokeWidth={2} />;
              break;
            case "PROJECT_COMPLETED":
            case "PROJECT_FAILED":
            case "RUN_STARTED":
              shape = <rect x={x - 2.5} y={y - 9} width={5} height={18} fill={fill} />;
              break;
            case "ROUTE_GENERATED":
            case "MOLECULE_RECEIVED":
              shape = <circle cx={x} cy={y} r={4.5} fill="none" stroke={fill} strokeWidth={1.6} />;
              break;
            default:
              shape = <circle cx={x} cy={y} r={3} fill={fill} />;
          }
          return (
            <g key={ev.seq} onClick={() => onSelect(ev)} style={{ cursor: "pointer" }} tabIndex={0} role="button" aria-label={`${ev.type} #${ev.seq}`} onKeyDown={(e) => e.key === "Enter" && onSelect(ev)}>
              <title>{`#${ev.seq} ${ev.type}: ${describeEvent(ev).text}`}</title>
              <rect x={x - 8} y={y - 12} width={16} height={24} fill="transparent" />
              {shape}
              {sel && <circle cx={x} cy={y} r={11} fill="none" stroke="rgb(var(--nc-hi))" strokeWidth={1.2} />}
            </g>
          );
        })}
        {glyphs
          .filter((_, i) => i % Math.max(1, Math.round(90 / step)) === 0)
          .map(({ ev, x }) => (
            <text key={`t${ev.seq}`} x={x} y={height - 6} fontSize="9" textAnchor="middle" fill="rgb(var(--nc-lo))" fontFamily="var(--nc-font-data)">
              {clock(ev.ts, t0)}
            </text>
          ))}
      </svg>
      <div className="flex gap-4 border-t border-nc-line px-3 py-1 font-data text-[10px] text-nc-lo">
        <span>■ tool</span>
        <span>◆ validation</span>
        <span>▲ critique</span>
        <span>○ route / molecule</span>
        <span>◎ replan</span>
        <span>│ run start / end</span>
        <span className={TONE_TEXT.bad}>red = failed</span>
        <span className={TONE_TEXT.warn}>amber = flagged</span>
      </div>
    </div>
  );
}
