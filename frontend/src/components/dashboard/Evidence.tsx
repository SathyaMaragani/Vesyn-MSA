"use client";

// EVIDENCE: what the run found and how much of the route it covers. Coverage is the backend's own count of steps with
// experimental / similar / predicted / no precedent; uncertainty is the backend's statement (it produces no
// probability). Anything the run has not reported reads NOT REPORTED.
import React from "react";
import Link from "next/link";
import type { DashboardModel } from "@/lib/dashboard/model";
import { NOT_REPORTED, Numeral, Section, TONE_COLOR } from "./ui";

export function Evidence({ m }: { m: DashboardModel }) {
  const e = m.evidence;
  const s = e.summary;
  const parts = s
    ? [
        { key: "exp", n: s.steps_with_experimental_evidence, color: TONE_COLOR.ok, label: "direct precedent" },
        { key: "sim", n: s.steps_with_similar_evidence, color: TONE_COLOR.run, label: "similar precedent" },
        { key: "pre", n: s.steps_predicted, color: TONE_COLOR.warn, label: "predicted" },
        { key: "non", n: s.steps_without_evidence, color: "rgb(var(--nc-line-strong))", label: "none" },
      ].filter((x) => x.n > 0)
    : [];
  return (
    <Section label="Evidence" index="08" aside={<Link href="/lab/evidence" className="nc-focus hover:text-nc-hi">view evidence →</Link>}>
      <div className="grid grid-cols-3 gap-4">
        <Numeral value={m.hasRun ? e.toolCalls.total : null} label="Tool calls" />
        <Numeral value={s ? s.distinct_sources : null} label="Sources" />
        <Numeral value={s ? s.steps_with_experimental_evidence + s.steps_with_similar_evidence : null} label="Steps with precedent" />
      </div>

      <div className="mt-5" aria-label="Precedent coverage of the displayed route">
        <div className="flex items-baseline justify-between font-data text-[10px] uppercase tracking-[0.16em] text-nc-lo">
          <span>Coverage</span>
          <span className="text-nc-hi">{s ? `${Math.round(s.evidence_coverage * 100)}% of ${s.steps} step${s.steps === 1 ? "" : "s"}` : NOT_REPORTED}</span>
        </div>
        <div className="mt-2 flex h-2 w-full gap-px overflow-hidden bg-nc-line/60">
          {parts.length === 0 ? <div className="h-full w-full" style={{ background: "repeating-linear-gradient(90deg, rgb(var(--nc-line)) 0 2px, transparent 2px 6px)" }} /> : parts.map((x) => <div key={x.key} title={`${x.n} ${x.label}`} className="h-full transition-[flex-grow] duration-700" style={{ flexGrow: x.n, background: x.color }} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-data text-[10px] text-nc-lo">
          {parts.length === 0 ? <span>{m.hasRun ? "the evaluator has not reported route evidence yet" : NOT_REPORTED}</span> : parts.map((x) => <span key={x.key} className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5" style={{ background: x.color }} />{x.n} {x.label}</span>)}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 border-t border-nc-line pt-3 font-data text-[11px]">
        <dt className="text-nc-lo">TOOL CALLS</dt>
        <dd className="text-nc-hi">{m.hasRun ? `${e.toolCalls.completed} completed · ${e.toolCalls.failed} failed` : NOT_REPORTED}</dd>
        <dt className="text-nc-lo">ANALOGUES</dt>
        <dd className="text-nc-hi">{e.analogues === null ? <span className="text-nc-lo">{NOT_REPORTED}</span> : `${e.analogues} found (ChEMBL)`}</dd>
        <dt className="text-nc-lo">UNCERTAINTY</dt>
        <dd className="text-[10.5px] leading-snug text-nc-mid">{e.uncertainty ?? <span className="text-nc-lo">{NOT_REPORTED}</span>}</dd>
      </dl>
    </Section>
  );
}
