"use client";

// AGENT DETAILS and THE AGENT DECISION TIMELINE. Details: one agent at a time - the one working, unless you pick
// another - with its task, what it finished, the tools it called through the gateway and the last thing it did.
// Timeline: one line per conclusion an agent reached, timed from the start of the run. Both read the events only.
import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardModel } from "@/lib/dashboard/model";
import type { AgentDetail, TimelineItem } from "@/lib/dashboard/overview";
import { AGENT_META, Orb, stagePill } from "./Engine";
import { Card, StatusPill } from "./ui";

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="font-data text-[9.5px] uppercase tracking-[0.18em] text-nc-lo">{children}</div>
);

export function AgentDetails({ m, detailOf }: { m: DashboardModel; detailOf: (id: string) => AgentDetail | null }) {
  const [picked, setPicked] = useState<string | null>(null);
  const id = picked ?? m.currentAgent?.id ?? (m.stages.some((s) => s.id === "validator" && s.state !== "skipped") ? "validator" : "planner");
  const d = detailOf(id);
  const stage = m.stages.find((s) => s.id === id);
  const pill = stagePill(stage?.state);
  const meta = AGENT_META[id];

  return (
    <Card title="Agent details" aside={<StatusPill tone={pill.tone} live={pill.live}>{pill.text}</StatusPill>}>
      <div className="flex items-center gap-3 border-b border-nc-line pb-3">
        {meta && <Orb Icon={meta.Icon} state={stage?.state} size={50} />}
        <div className="min-w-0 flex-1">
          <select value={id} onChange={(e) => setPicked(e.target.value)} aria-label="Agent" className="nc-focus -ml-1 max-w-full rounded-md bg-transparent px-1 text-[17px] font-medium text-nc-hi hover:bg-nc-cyan/[0.06]">
            {m.stages.map((s) => (
              <option key={s.id} value={s.id} className="bg-nc-base text-[13px]">{s.id === id && d ? d.name : (AGENT_META[s.id]?.name ?? s.label)}</option>
            ))}
          </select>
          <div className="text-[11.5px] leading-snug text-nc-lo">{d?.role ?? meta?.blurb ?? "role not reported"}</div>
        </div>
      </div>

      <ol className="relative mt-3 space-y-3 border-l border-nc-line-strong pl-4">
        {[
          { k: "Current task", v: d?.current ?? (m.hasRun ? "None - idle" : "—") },
          { k: "Completed tasks", v: d && d.completed.length ? d.completed.slice(-3).join(" · ") : "None yet" },
          { k: "Tools used", v: d && d.tools.length ? d.tools : "None yet" },
          { k: "Last action", v: d?.lastAction ?? "No event in this run" },
        ].map((row) => (
          <li key={row.k} className="relative">
            <span aria-hidden className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-nc-cyan bg-nc-base" />
            <Label>{row.k}</Label>
            {Array.isArray(row.v) ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {row.v.map((t) => (
                  <span key={t} className="nc-chip">{t}</span>
                ))}
              </div>
            ) : (
              <div className="mt-0.5 text-[12px] leading-snug text-nc-hi">{row.v}</div>
            )}
          </li>
        ))}
      </ol>

      <Link href="/lab/audit" className="nc-btn mt-4 w-full justify-center py-2">
        View agent trace <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}

const TONE = { ok: "rgb(var(--nc-ok))", warn: "rgb(var(--nc-warn))", bad: "rgb(var(--nc-bad))" } as const;

export function Timeline({ items, running }: { items: TimelineItem[]; running: boolean }) {
  return (
    <Card title="Decision timeline" aside={<Link href="/lab/audit" className="nc-btn whitespace-nowrap">Full trace <ArrowRight className="h-3 w-3" aria-hidden /></Link>}>
      {items.length === 0 ? (
        <p className="py-4 text-[12px] text-nc-lo">{running ? "No agent has reached a conclusion yet." : "No run selected."}</p>
      ) : (
        <ol className="relative">
          <span aria-hidden className="absolute bottom-3 left-[8px] top-3 w-px bg-nc-line-strong" />
          {items.map((it) => (
            <li key={it.seq} className="relative flex gap-3 py-2">
              <span aria-hidden className="relative z-[1] mt-0.5 inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border text-[9px] font-bold" style={{ borderColor: TONE[it.tone], color: TONE[it.tone], background: "rgb(var(--nc-panel))" }}>
                {it.tone === "ok" ? "✓" : it.tone === "warn" ? "!" : "✕"}
              </span>
              <span className="w-10 shrink-0 pt-px font-data text-[10.5px] tabular-nums text-nc-lo">{it.at}</span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-nc-hi">{it.who}</div>
                <div className="text-[11.5px] leading-snug text-nc-mid">{it.text}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
