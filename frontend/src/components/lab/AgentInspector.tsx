"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useFacilityState } from "@/components/facility/useFacilityState";
import { ZONES } from "@/components/facility/layout";
import { TONE_LOOK } from "@/components/facility/facilityState";
import { describeEvent } from "@/lib/events/describe";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";
import type { KnownAgentId } from "@/types/agents";

const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px]">
      <span className="font-data text-[9px] uppercase tracking-[0.2em] text-nc-lo">{k}</span>
      <span className="min-w-0 truncate text-right text-[12px] text-nc-hi">{children}</span>
    </div>
  );
}

/**
 * The contextual station panel: small, secondary to the 3D facility, and every value is the backend's.
 * STATUS, TASK, CURRENT STEP, TOOLS, EVENTS - and, if the department failed, the backend's own error text.
 */
export function AgentInspector() {
  const { selectedId, select } = useLabUI();
  const { tools, run } = useNeo();
  const fs = useFacilityState();
  const [more, setMore] = useState(false);
  const zone = selectedId && selectedId in ZONES ? fs.zones[selectedId as KnownAgentId] : null;

  const events = useMemo(() => {
    if (!zone) return [];
    const out = [];
    for (let i = run.events.length - 1; i >= 0 && out.length < 6; i--) {
      const ev = run.events[i];
      if (ev.agent_id === zone.id && ev.type !== "TOOL_REQUESTED") out.push(ev);
    }
    return out;
  }, [run.events, zone]);

  if (!zone) return null;
  const def = ZONES[zone.id];
  const look = TONE_LOOK[zone.tone];
  const allowed = tools?.filter((t) => t.allowed_agents.includes(zone.id)) ?? null;
  const active = zone.tools.filter((t) => t.status === "RUNNING" || t.status === "REQUESTED");
  const toolLine = active.length ? active.map((t) => t.name).join(", ") : zone.tools.length ? [...new Set(zone.tools.map((t) => t.name))].join(", ") : null;

  return (
    <div className="pointer-events-auto absolute left-3 top-[6.5rem] z-20 w-[19rem]">
      <div className="border border-nc-line-strong bg-nc-base/78 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-nc-line px-3 py-2">
          <div className="min-w-0">
            <div className="font-data text-[9px] tracking-[0.24em] text-nc-lo">
              {def.number} · {def.discipline}
            </div>
            <div className="truncate text-[14px] text-nc-hi">{zone.name}</div>
          </div>
          <button type="button" onClick={() => select(null)} aria-label="Close" className="nc-focus text-nc-lo hover:text-nc-hi">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="px-3 py-2">
          <Row k="Status">
            <span className="inline-flex items-center gap-1.5 font-data text-[11px] uppercase tracking-wider" style={{ color: css(look.hex) }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: css(look.hex) }} />
              {zone.activity}
            </span>
          </Row>
          <Row k="Task">{zone.task ?? <span className="font-data text-[11px] italic text-nc-lo">not reported</span>}</Row>
          <Row k="Current step">{zone.step ?? <span className="font-data text-[11px] italic text-nc-lo">—</span>}</Row>
          <Row k="Tools">{toolLine ? <span className="font-data text-[11px]">{toolLine}</span> : <span className="font-data text-[11px] italic text-nc-lo">none in this run</span>}</Row>
          <Row k="Events">
            <span className="font-data">{zone.events}</span>
          </Row>
          {zone.error && (
            <div className="mt-2 border-l-2 border-nc-bad/70 bg-nc-bad/[0.06] px-2 py-1.5 font-data text-[11px] leading-snug text-nc-bad">{zone.error}</div>
          )}
        </div>
        <button type="button" onClick={() => setMore((m) => !m)} className="nc-focus w-full border-t border-nc-line px-3 py-1.5 text-left font-data text-[9px] uppercase tracking-[0.2em] text-nc-lo hover:text-nc-mid">
          {more ? "Less" : "Details"}
        </button>
        {more && (
          <div className="max-h-64 space-y-3 overflow-y-auto border-t border-nc-line px-3 py-2">
            {zone.role && <div className="text-[12px] text-nc-mid">{zone.role}</div>}
            <div>
              <div className="nc-label mb-1">Permitted tools</div>
              {allowed === null ? (
                <span className="font-data text-[11px] italic text-nc-lo">not reported</span>
              ) : allowed.length === 0 ? (
                <span className="text-[12px] text-nc-mid">None — coordination only.</span>
              ) : (
                <ul className="space-y-0.5">
                  {allowed.map((t) => (
                    <li key={t.name} className="font-data text-[11px] text-nc-mid">
                      {t.name} <span className="text-nc-lo">{t.version}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="nc-label mb-1">Recent activity</div>
              {events.length === 0 ? (
                <span className="font-data text-[11px] italic text-nc-lo">no events for this agent in this run</span>
              ) : (
                <ol className="space-y-1">
                  {events.map((ev) => (
                    <li key={ev.seq} className="text-[11px] leading-snug text-nc-mid">
                      <span className="font-data text-[9px] text-nc-lo">#{ev.seq} </span>
                      {describeEvent(ev).text}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
