"use client";

import React, { useMemo, useState } from "react";
import { InProgress, WorkspaceGate } from "@/components/lab/WorkspaceGate";
import { Field, NotReported, Panel, Tag, cx } from "@/components/ui/primitives";
import { flattenSteps } from "@/lib/events/routeSteps";
import { provenanceRows, type SourceStatus } from "@/lib/events/provenance";
import type { Tone } from "@/lib/events/activity";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import type { Precedent } from "@/types/evidence";
import type { RankedRoute } from "@/types/routes";

const LEVEL_LABEL: Record<string, string> = {
  experimental: "DIRECT EXPERIMENTAL PRECEDENT",
  similar_experimental: "SIMILAR EXPERIMENTAL PRECEDENT",
  predicted: "AI-PREDICTED CONDITIONS",
  unavailable: "NO VERIFIED CONDITION EVIDENCE",
};

/** Only the provenance fields the backend actually supplied are rendered. */
function PrecedentRow({ p, kind }: { p: Precedent; kind: "direct" | "similar" }) {
  const v = p.provenance;
  return (
    <li className="border border-nc-line bg-nc-panel/40 p-2.5">
      <div className="flex items-center gap-2">
        <Tag tone={kind === "direct" ? "ok" : "warn"}>{kind}</Tag>
        {v?.source_type && <span className="font-data text-[10px] uppercase text-nc-lo">{v.source_type}</span>}
        {v?.dataset_name && <span className="font-data text-[10px] text-nc-lo">{v.dataset_name}{v.dataset_version ? ` ${v.dataset_version}` : ""}</span>}
        {p.combined_similarity !== undefined && <span className="ml-auto font-data text-[10px] text-nc-lo">similarity {p.combined_similarity}</span>}
      </div>
      {v?.title && <div className="mt-1 text-[12px] text-nc-hi">{v.title}</div>}
      <div className="mt-1 grid grid-cols-3 gap-x-4 gap-y-1">
        <Field label="Source id" value={v?.source_id} mono />
        <Field label="Patent" value={v?.patent_number} mono />
        <Field label="DOI" value={v?.doi} mono />
        <Field label="Year" value={v?.year} mono />
        <Field label="Journal" value={v?.journal} />
        <Field label="Licence" value={v?.license} />
      </div>
      {v?.doi && <div className="mt-1 text-[10px] text-nc-lo">A DOI here may belong to the dataset&apos;s curating publication, not the experiment itself.</div>}
      {v?.url && (
        <a href={v.url} target="_blank" rel="noreferrer noopener" className="nc-focus mt-1 inline-block break-all font-data text-[10px] text-nc-cyan hover:underline">
          {v.url} {v.url_origin ? `(${v.url_origin})` : ""}
        </a>
      )}
    </li>
  );
}

function RouteEvidence({ route }: { route: RankedRoute }) {
  const steps = useMemo(() => flattenSteps(route.tree), [route]);
  const s = route.evidence_summary;
  return (
    <div className="space-y-3 p-4">
      {s ? (
        <div className="grid grid-cols-5 gap-4 border border-nc-line bg-nc-panel/50 p-3">
          <Field label="Steps" value={s.steps} mono />
          <Field label="Direct" value={s.steps_with_experimental_evidence} mono />
          <Field label="Similar" value={s.steps_with_similar_evidence} mono />
          <Field label="No evidence" value={s.steps_without_evidence} mono />
          <Field label="Distinct sources" value={s.distinct_sources} mono />
        </div>
      ) : (
        <div className="text-[12px]"><NotReported note="No evidence summary for this route" /></div>
      )}
      <p className="border border-nc-warn/40 bg-nc-warn/[0.06] px-3 py-2 text-[12px] text-nc-warn">The route search did not take this step from these records - they were matched against it afterwards.</p>
      <p className="text-[11px] text-nc-lo">“No evidence” means absent from the indexed ORD/USPTO data — not unknown to chemistry.</p>
      {steps.map((st) => {
        const ev = st.reaction.evidence;
        const level = ev?.evidence_level;
        return (
          <div key={st.index} className="border border-nc-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-data text-[11px] text-nc-cyan">STEP {st.index}</span>
              {level ? <Tag tone={level === "experimental" ? "ok" : level === "similar_experimental" ? "warn" : "dim"}>{LEVEL_LABEL[level] ?? level}</Tag> : <NotReported />}
              {ev?.provider && <span className="font-data text-[10px] text-nc-lo">{ev.provider} {ev.provider_version ?? ""} {ev.dataset_version ? `· data ${ev.dataset_version}` : ""}</span>}
            </div>
            {level === "similar_experimental" && <div className="mt-1 text-[12px] text-nc-warn">Similar reactions on different substrates. Not a precedent for this reaction.</div>}
            {ev?.reason && <div className="mt-1 text-[12px] text-nc-mid">{ev.reason}</div>}
            <ul className="mt-2 space-y-2">
              {(ev?.direct_precedents ?? []).map((p, i) => <PrecedentRow key={`d${i}`} p={p} kind="direct" />)}
              {(ev?.similar_precedents ?? []).slice(0, 3).map((p, i) => <PrecedentRow key={`s${i}`} p={p} kind="similar" />)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

const STATUS: Record<SourceStatus, { label: string; tone: Tone }> = {
  not_called: { label: "NOT REPORTED", tone: "dim" },
  running: { label: "RUNNING", tone: "run" },
  ok: { label: "COMPLETED", tone: "ok" },
  partial: { label: "PARTIAL", tone: "warn" },
  failed: { label: "FAILED", tone: "bad" },
};

/** Which tool produced what, for which agent, and whether it ran at all. */
function ProvenanceChain() {
  const { run } = useNeo();
  const rows = useMemo(() => provenanceRows(run), [run]);
  return (
    <Panel title="Provenance chain" className="border-b border-nc-line">
      <table className="w-full font-data text-[11px]">
        <thead>
          <tr className="text-left text-nc-lo">
            <th className="px-4 py-1 font-normal">Source</th>
            <th className="font-normal">Tool</th>
            <th className="font-normal">Agent</th>
            <th className="font-normal">Status</th>
            <th className="font-normal">Calls</th>
            <th className="font-normal">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tool} className="border-t border-nc-line/60 text-nc-mid">
              <td className="px-4 py-1.5 font-ui text-[12px] text-nc-hi">{r.what}</td>
              <td>{r.tool}{r.versions[0] ? <span className="text-nc-lo"> {r.versions[0]}</span> : null}</td>
              <td>{r.agents.join(", ") || "—"}</td>
              <td><Tag tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Tag></td>
              <td>{r.calls.length}</td>
              <td>{r.firstAt ? `${r.firstAt.slice(11, 19)} · ${r.totalMs} ms` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-nc-line px-4 py-2 text-[11px] text-nc-lo">
        NOT REPORTED means the tool made no call in this run. Open the flight recorder for each call&apos;s full input and output.
      </p>
    </Panel>
  );
}

export function EvidenceWorkspace() {
  const { run, runRecord } = useNeo();
  const result = useRunResult();
  const [sel, setSel] = useState<number | null>(null);
  const routes = result?.ranked_routes ?? [];
  const chosen = routes.find((r) => r.rank === (sel ?? routes[0]?.rank)) ?? null;

  return (
    <WorkspaceGate>
      <ProvenanceChain />
      {!result && (runRecord.state === "loading" || run.phase === "running") && <InProgress what="Per-step evidence" />}
      {result && routes.length === 0 && <div className="p-6 text-[13px] text-nc-mid">No routes were found, so there is no evidence to show. {result.verdict.reason}</div>}
      {result && routes.length > 0 && (
        <>
          <div className="flex gap-px border-b border-nc-line">
            {routes.map((r) => (
              <button key={r.db_id} type="button" onClick={() => setSel(r.rank)} className={cx("nc-focus px-4 py-2 font-data text-[11px] uppercase tracking-wider", chosen?.rank === r.rank ? "bg-nc-cyan/[0.07] text-nc-hi" : "text-nc-lo hover:text-nc-mid")}>
                Route {r.route_id}
              </button>
            ))}
          </div>
          {chosen && <RouteEvidence route={chosen} />}
          <Panel title="Sources consulted" className="border-t border-nc-line">
            <p className="p-4 text-[12px] text-nc-mid">
              Retrieval ran against the indexed ORD / USPTO corpus (via <span className="font-data">ord.evidence</span>). PubChem was used for name resolution and ChEMBL for approved-drug similarity — see the Chemistry workspace. Nothing here comes from outside what the backend returned.
            </p>
          </Panel>
        </>
      )}
    </WorkspaceGate>
  );
}
