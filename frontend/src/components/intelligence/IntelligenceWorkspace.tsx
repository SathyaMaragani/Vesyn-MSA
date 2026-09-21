"use client";

import React, { useMemo } from "react";
import { WorkspaceGate } from "@/components/lab/WorkspaceGate";
import { Field, NotReported, Panel, TONE_BORDER, TONE_TEXT, cx } from "@/components/ui/primitives";
import { buildBrief } from "@/lib/events/brief";
import { activeAgentId } from "@/lib/events/attention";
import { buildDecisions, degradedSignals } from "@/lib/events/decisions";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";

/**
 * Structured decision summaries - trigger, action, evidence, uncertainty - built
 * only from event payloads and the backend's own limitation text. No model
 * reasoning is shown or invented; a field the events don't carry says so.
 */
export function IntelligenceWorkspace() {
  const { run, agents, projects, projectId } = useNeo();
  const result = useRunResult();
  const goal = projects.state === "ok" ? (projects.data.find((p) => p.id === projectId)?.goal ?? null) : null;
  const activeId = activeAgentId(agents);
  const brief = useMemo(
    () => buildBrief({ run, result, goal, activeAgent: agents.find((a) => a.id === activeId)?.name ?? null }),
    [run, result, goal, agents, activeId],
  );
  const decisions = useMemo(() => buildDecisions(run, result?.limitations ?? null), [run, result]);
  const degraded = useMemo(() => degradedSignals(run), [run]);
  const current = decisions[decisions.length - 1] ?? null;
  const earlier = decisions.slice(0, -1).reverse();

  return (
    <WorkspaceGate>
      <section aria-label="Situation brief" className="grid grid-cols-3 gap-px border-b border-nc-line bg-nc-line">
        {brief.map((b) => (
          <div key={b.key} className="bg-nc-base px-4 py-2.5">
            <div className="nc-label">{b.label}</div>
            <div className={cx("mt-0.5 text-[12.5px] leading-snug", b.value === null ? "" : TONE_TEXT[b.tone === "dim" ? "idle" : b.tone])}>
              {b.value === null ? <NotReported /> : b.value}
            </div>
          </div>
        ))}
      </section>
      {degraded.length > 0 && (
        <div className="border-b border-nc-warn/40 bg-nc-warn/[0.06] px-4 py-2">
          <div className="font-data text-[11px] tracking-[0.16em] text-nc-warn">DEGRADED SIGNALS</div>
          <ul className="mt-1 space-y-0.5 text-[12px] text-nc-mid">
            {degraded.map((c) => (
              <li key={c.callId}>
                <span className="font-data text-nc-hi">{c.tool}</span> {c.status === "DENIED" ? "denied by policy" : "failed"}
                {c.agentId ? ` (${c.agentId})` : ""}: {c.error ?? "no detail"} — the run continued without it.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-[1fr_22rem] gap-px bg-nc-line">
        <div className="min-w-0 bg-nc-base">
          <div className="nc-label border-b border-nc-line px-4 py-2">Current decision</div>
          {current ? (
            <DecisionCard d={current} big />
          ) : (
            <div className="p-4 text-[12px] text-nc-lo">No decisions recorded yet for this run.</div>
          )}
          {earlier.length > 0 && (
            <>
              <div className="nc-label border-y border-nc-line px-4 py-2">Earlier decisions</div>
              {earlier.map((d) => <DecisionCard key={d.seq} d={d} />)}
            </>
          )}
        </div>

        <div className="space-y-px bg-nc-line">
          <Panel title="Critic notes" className="border-0 bg-nc-base">
            <p className="p-4 text-[12px] leading-relaxed text-nc-mid">
              {result ? (result.critic_notes ?? <NotReported note="No LLM notes: narration disabled or unavailable; the deterministic critique is on the Routes workspace" />) : <NotReported />}
            </p>
          </Panel>
          <Panel title="Agent messages" className="border-0 bg-nc-base" bodyClassName="max-h-80 overflow-y-auto">
            {run.messages.length === 0 ? (
              <div className="p-4"><NotReported /></div>
            ) : (
              <ol>
                {run.messages.map((m) => (
                  <li key={m.seq} className="border-b border-nc-line/60 px-4 py-2 last:border-0">
                    <div className="font-data text-[10px] text-nc-lo">{m.from ?? "?"} → {m.to} · #{m.seq}</div>
                    <div className="text-[12px] leading-snug text-nc-mid">{m.text}</div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          {result && (
            <Panel title="Stated limitations" className="border-0 bg-nc-base">
              <ul className="list-inside list-disc space-y-1 p-4 text-[12px] text-nc-mid">{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </Panel>
          )}
        </div>
      </div>
    </WorkspaceGate>
  );
}

function DecisionCard({ d, big = false }: { d: ReturnType<typeof buildDecisions>[number]; big?: boolean }) {
  return (
    <div className={cx("border-b border-nc-line/60 px-4 py-3", big && "border-l-2", big && TONE_BORDER[d.tone])}>
      <div className="flex items-baseline gap-2">
        <span className={cx("font-data text-[13px]", TONE_TEXT[d.tone])}>{d.title}</span>
        <span className="font-data text-[10px] text-nc-lo">{d.agentId ?? "system"} · #{d.seq}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2">
        <Field label="Trigger" value={d.trigger} />
        <Field label="Action" value={d.action} />
        <Field label="Evidence" value={d.evidence} />
        <Field label="Uncertainty" value={d.uncertainty} />
      </div>
    </div>
  );
}
