"use client";

import React from "react";
import { AgentStatusDot } from "@/components/agents/AgentStatusDot";
import { TONE_TEXT, cx } from "@/components/ui/primitives";
import { ACTIVITY_META } from "@/lib/events/activity";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";

/** Compact, always-visible agent status. Clicking an agent focuses its workstation. */
export function AgentRail() {
  const { agents } = useNeo();
  const { selectedId, focusAgent } = useLabUI();

  return (
    <aside
      aria-label="Agent status"
      className="group pointer-events-auto absolute right-3 top-24 z-20 w-9 overflow-hidden border border-nc-line bg-nc-base/75 backdrop-blur-md transition-[width] duration-200 focus-within:w-60 hover:w-60"
    >
      <div className="nc-label whitespace-nowrap border-b border-nc-line px-3 py-1.5">Agent status</div>
      <ul>
        {agents.map((a) => {
          const meta = ACTIVITY_META[a.activity];
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => focusAgent(a.id)}
                className={cx(
                  "nc-focus flex w-60 items-center gap-2.5 px-3 py-1.5 text-left hover:bg-nc-panel-2",
                  selectedId === a.id && "bg-nc-cyan/[0.07]",
                )}
              >
                <AgentStatusDot activity={a.activity} />
                <span className="min-w-0 flex-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                  <span className="block truncate text-[12px] text-nc-hi">{a.name}</span>
                  <span className="block truncate font-data text-[10px] text-nc-lo">
                    {a.activeCalls[0]?.tool ?? (a.unfinishedCalls[0] ? `${a.unfinishedCalls[0].tool} — no completion recorded` : (a.currentTask?.title ?? "—"))}
                  </span>
                </span>
                <span className={cx("font-data text-[9px] uppercase tracking-wider opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100", TONE_TEXT[meta.tone])}>{meta.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
