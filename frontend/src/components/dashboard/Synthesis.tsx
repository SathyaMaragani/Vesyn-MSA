"use client";

// SYNTHESIS INTELLIGENCE: how many routes exist, how many the validator has judged, how many it rejected, and which
// one is current. The bar is the validator's real verdicts over every route generated; a value the events do not
// support reads NOT REPORTED.
import React from "react";
import Link from "next/link";
import type { DashboardModel } from "@/lib/dashboard/model";
import { NOT_REPORTED, Numeral, Section, TONE_COLOR } from "./ui";

export function Synthesis({ m }: { m: DashboardModel }) {
  const s = m.synthesis;
  const unjudged = s.generated !== null && s.validated !== null ? s.generated - s.validated : null;
  const insufficient = s.validated !== null && s.supported !== null && s.rejected !== null ? s.validated - s.supported - s.rejected : null;
  const total = s.generated ?? 0;
  const seg: { key: string; n: number; color: string; label: string }[] =
    total > 0 && s.supported !== null && s.rejected !== null && insufficient !== null && unjudged !== null
      ? [
          { key: "sup", n: s.supported, color: TONE_COLOR.ok, label: "supported" },
          { key: "ins", n: insufficient, color: TONE_COLOR.warn, label: "insufficient evidence" },
          { key: "rej", n: s.rejected, color: TONE_COLOR.bad, label: "review required" },
          { key: "pen", n: unjudged, color: "rgb(var(--nc-line-strong))", label: "not yet judged" },
        ].filter((x) => x.n > 0)
      : [];

  return (
    <Section label="Synthesis intelligence" index="06" aside={<Link href="/lab/routes" className="nc-focus hover:text-nc-hi">all routes →</Link>}>
      <div className="grid grid-cols-4 gap-4">
        <Numeral value={s.generated} label="Generated" />
        <Numeral value={s.validated} label="Validated" />
        <Numeral value={s.rejected} label="Rejected" tone="bad" />
        <Numeral value={s.alternatives} label="Alternatives" tone="warn" />
      </div>

      <div className="mt-5" aria-label="Verdicts over every generated route">
        <div className="flex h-2 w-full gap-px overflow-hidden bg-nc-line/60">
          {seg.length === 0 ? <div className="h-full w-full" style={{ background: "repeating-linear-gradient(90deg, rgb(var(--nc-line)) 0 2px, transparent 2px 6px)" }} /> : seg.map((x) => <div key={x.key} title={`${x.n} ${x.label}`} className="h-full transition-[flex-grow] duration-700" style={{ flexGrow: x.n, background: x.color }} />)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-data text-[10px] text-nc-lo">
          {seg.length === 0 ? <span>{s.generated === null ? NOT_REPORTED : "no route has been generated"}</span> : seg.map((x) => (
            <span key={x.key} className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5" style={{ background: x.color }} />{x.n} {x.label}</span>
          ))}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-[110px_minmax(0,1fr)] gap-y-2 border-t border-nc-line pt-3 font-data text-[11px]">
        <dt className="text-nc-lo">CURRENT ROUTE</dt>
        <dd className="truncate text-nc-hi" title={s.current ?? undefined}>{s.current ?? <span className="text-nc-lo">{NOT_REPORTED}</span>}</dd>
        <dt className="text-nc-lo">SEARCH ATTEMPTS</dt>
        <dd className="text-nc-hi">{s.attempts ?? <span className="text-nc-lo">{NOT_REPORTED}</span>}</dd>
        <dt className="text-nc-lo">OUTCOME</dt>
        <dd className="text-nc-mid">{m.outcome ?? <span className="text-nc-lo">{m.hasRun ? (m.phase === "running" ? "pending — the run is in progress" : NOT_REPORTED) : NOT_REPORTED}</span>}</dd>
      </dl>
    </Section>
  );
}
