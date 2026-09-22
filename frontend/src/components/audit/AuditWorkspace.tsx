"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WorkspaceGate } from "@/components/lab/WorkspaceGate";
import { JsonBlock, NotReported, Tag, TONE_TEXT, cx } from "@/components/ui/primitives";
import { getAuditCall, listAudit } from "@/lib/api";
import { describeEvent } from "@/lib/events/describe";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";
import { ReplayBar } from "./ReplayBar";
import { Swimlane } from "./Swimlane";
import type { LoadState } from "@/types/api";
import type { AuditCall, AuditEntry } from "@/types/audit";
import type { NeoEvent } from "@/types/events";

const QUIET = new Set(["AGENT_STATUS_CHANGED", "TOOL_REQUESTED", "TASK_ASSIGNED"]);

/** mm:ss since the first event of the run, from the events' own timestamps. */
function clock(ts: string, t0: number): string {
  const s = Math.max(0, Math.round((Date.parse(ts) - t0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function CallDetail({ callId }: { callId: string }) {
  const { demo } = useNeo();
  const [call, setCall] = useState<LoadState<AuditCall>>({ state: "loading" });
  useEffect(() => {
    if (demo) {
      const recorded = demo.auditCalls[callId];
      setCall(recorded ? { state: "ok", data: recorded } : { state: "empty" });
      return;
    }
    let live = true;
    setCall({ state: "loading" });
    void getAuditCall(callId).then((r) => {
      if (!live) return;
      if (r.status === "ok") setCall({ state: "ok", data: r.data });
      else if (r.status === "offline") setCall({ state: "offline" });
      else setCall({ state: "error", message: r.message });
    });
    return () => {
      live = false;
    };
  }, [callId, demo]);

  if (call.state === "loading") return <div className="font-data text-[11px] text-nc-lo">loading audit record…</div>;
  if (call.state === "offline") return <div className="font-data text-[11px] text-nc-bad">API OFFLINE</div>;
  if (call.state === "error") return <div className="font-data text-[11px] text-nc-bad">{call.message}</div>;
  if (call.state === "empty") return <NotReported />;
  const c = call.data;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-data text-[11px] text-nc-mid">
        <span>tool <span className="text-nc-hi">{c.tool}</span></span>
        <span>version <span className="text-nc-hi">{c.tool_version ?? "not reported"}</span></span>
        <span>agent <span className="text-nc-hi">{c.agent_id}</span></span>
        <span>status <span className="text-nc-hi">{c.status}</span></span>
        <span>duration <span className="text-nc-hi">{c.duration_ms ?? "—"} ms</span></span>
        <span>started <span className="text-nc-hi">{c.started_at}</span></span>
      </div>
      {c.reason && <div className="text-[12px] text-nc-mid"><span className="nc-label mr-2">Why</span>{c.reason}</div>}
      {c.error && <div className="text-[12px] text-nc-bad">{c.error}</div>}
      <div className="nc-label">Input</div>
      <JsonBlock value={c.input} />
      <div className="nc-label">Output</div>
      <JsonBlock value={c.output} />
    </div>
  );
}

export function AuditWorkspace() {
  // the recorder is always the COMPLETE live record - replay moves a cursor over it, it never shortens it
  const { liveRun: run, runId, demo } = useNeo();
  const { focusAgent } = useLabUI();
  const [showChurn, setShowChurn] = useState(false);
  const [selSeq, setSelSeq] = useState<number | null>(null);
  const [audit, setAudit] = useState<LoadState<AuditEntry[]>>({ state: "empty" });

  const events = useMemo(() => (showChurn ? run.events : run.events.filter((e) => !QUIET.has(e.type))), [run.events, showChurn]);
  const lane = useMemo(() => run.events.filter((e) => !QUIET.has(e.type)), [run.events]);
  // choosing an event selects it AND flies the 3D camera to the agent that produced it
  const choose = (ev: NeoEvent) => {
    setSelSeq(ev.seq);
    if (ev.agent_id) focusAgent(ev.agent_id);
  };
  const t0 = run.events.length ? Date.parse(run.events[0].ts) : 0;
  const selected: NeoEvent | undefined = run.events.find((e) => e.seq === selSeq);
  const callId = selected && "call_id" in selected.data ? String((selected.data as { call_id: string }).call_id) : null;

  // Persisted provenance rows for the run (the source of truth; events are the live view).
  const completedCalls = run.callOrder.filter((id) => run.calls[id]?.status !== "RUNNING" && run.calls[id]?.status !== "REQUESTED").length;
  useEffect(() => {
    if (!runId) return;
    if (demo) {
      setAudit(demo.audit.length ? { state: "ok", data: demo.audit } : { state: "empty" });
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void listAudit(runId).then((r) => {
        if (!live) return;
        if (r.status === "ok") setAudit(r.data.length ? { state: "ok", data: r.data } : { state: "empty" });
        else if (r.status === "offline") setAudit({ state: "offline" });
        else setAudit({ state: "error", message: r.message });
      });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [runId, completedCalls, demo]);

  const counts = { failed: 0, denied: 0 };
  if (audit.state === "ok") for (const a of audit.data) a.status === "FAILED" ? counts.failed++ : a.status === "DENIED" ? counts.denied++ : 0;

  return (
    <WorkspaceGate>
      <div className="flex items-center gap-4 border-b border-nc-line px-4 py-2 font-data text-[11px] text-nc-lo">
        <span>{run.events.length} events</span>
        <span>
          {audit.state === "ok" ? `${audit.data.length} tool calls in the audit log` : audit.state === "offline" ? "audit log unreachable" : audit.state === "error" ? `audit log error: ${audit.message}` : "no tool calls recorded"}
        </span>
        {audit.state === "ok" && counts.failed > 0 && <span className="text-nc-bad">{counts.failed} failed</span>}
        {audit.state === "ok" && counts.denied > 0 && <span className="text-nc-bad">{counts.denied} denied</span>}
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={showChurn} onChange={(e) => setShowChurn(e.target.checked)} />
          show status churn
        </label>
      </div>
      {lane.length > 0 && <ReplayBar lane={lane} />}
      {lane.length > 0 && <Swimlane events={lane} selectedSeq={selSeq} onSelect={choose} />}
      <div className="grid min-h-0 grid-cols-[1fr_26rem]">
        <ol className="min-w-0 border-r border-nc-line">
          {events.length === 0 && <li className="p-4 text-[12px] text-nc-lo">No events yet.</li>}
          {events.map((ev) => {
            const line = describeEvent(ev);
            return (
              <li key={ev.seq}>
                <button
                  type="button"
                  onClick={() => choose(ev)}
                  className={cx("nc-focus flex w-full items-baseline gap-3 border-b border-nc-line/50 px-4 py-1.5 text-left hover:bg-nc-panel-2", selSeq === ev.seq && "bg-nc-cyan/[0.07]")}
                >
                  <span className="w-11 shrink-0 font-data text-[11px] text-nc-lo">{clock(ev.ts, t0)}</span>
                  <span className={cx("w-32 shrink-0 truncate font-data text-[11px]", TONE_TEXT[line.tone])}>{ev.type}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-nc-mid">{line.text}</span>
                  <span className="shrink-0 font-data text-[10px] text-nc-lo">#{ev.seq}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <aside className="min-w-0 p-4">
          {!selected ? (
            <div className="text-[12px] text-nc-lo">Select an event to inspect its structured payload{callId ? "" : "."}</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tag tone={describeEvent(selected).tone}>{selected.type}</Tag>
                <span className="font-data text-[11px] text-nc-lo">{selected.agent_id ?? "system"} · {selected.ts}</span>
              </div>
              <div className="nc-label">Event data</div>
              <JsonBlock value={selected.data} limit={2500} />
              {callId && (
                <>
                  <div className="nc-label border-t border-nc-line pt-3">Audit record · {callId}</div>
                  <CallDetail callId={callId} />
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </WorkspaceGate>
  );
}
