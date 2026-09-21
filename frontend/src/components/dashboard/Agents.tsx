"use client";

// AGENT STATUS: all seven, each with its status, its current task and its last event. Every cell is the backend's
// (roster + folded events); an agent with nothing to report says so.
import React from "react";
import Link from "next/link";
import { agentHref, type DashboardModel } from "@/lib/dashboard/model";
import { Dot, Section, TONE_COLOR, clock } from "./ui";

export function Agents({ m }: { m: DashboardModel }) {
  return (
    <Section label="Agents" index="04" aside={<span>{m.agents.filter((a) => a.tone === "run" || a.tone === "warn").length} working</span>}>
      <div className="grid grid-cols-[minmax(0,1.05fr)_96px_minmax(0,1.3fr)] gap-x-4 border-b border-nc-line pb-1.5 font-data text-[9px] uppercase tracking-[0.18em] text-nc-lo">
        <span>Agent</span>
        <span>Status</span>
        <span>Current task · last event</span>
      </div>
      <ul>
        {m.agents.map((a) => (
          <li key={a.id}>
            <Link href={agentHref(a.id)} className="nc-focus group grid grid-cols-[minmax(0,1.05fr)_96px_minmax(0,1.3fr)] items-start gap-x-4 border-b border-nc-line/70 py-2 hover:bg-nc-panel/50">
              <span className="truncate text-[12.5px] text-nc-hi group-hover:text-nc-cyan">{a.name.replace(/ Agent$/, "")}</span>
              <span className="flex items-center gap-2 font-data text-[10px] uppercase tracking-[0.12em]" style={{ color: TONE_COLOR[a.tone] }}>
                <Dot tone={a.tone} pulse={a.tone === "run"} /> {a.status}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-data text-[11px] text-nc-mid" title={a.task ?? undefined}>{a.task ?? <span className="text-nc-lo">no current task</span>}</span>
                <span className="mt-0.5 block truncate font-data text-[10px] text-nc-lo" title={a.lastEvent?.text}>
                  {a.lastEvent ? `${clock(a.lastEvent.ts)} · ${a.lastEvent.text}` : "no event in this run"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
