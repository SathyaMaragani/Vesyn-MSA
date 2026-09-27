"use client";

// MEMORY: what earlier investigations contributed to this run.
//
// Three facts, in the order that matters: how much was recalled, which recalled lessons actually
// marked a step (the only part that changed a score), and what this run handed back. A recalled
// memory that changed nothing is still listed - it was read and found not to apply.
//
// A memory the pipeline could not have produced (a lab outcome, a chemist's preference) is seeded
// for the demo and tagged; it reads SIMULATED here and nothing dresses it up as measured. Memory
// being unreachable is not a zero: the run continued without it, and that is what the panel says.
import React from "react";
import type { DashboardModel } from "@/lib/dashboard/model";
import { NOT_REPORTED, Numeral, Section, TONE_COLOR } from "./ui";

/** Hindsight serialises a fact as "<fact> | When: <date> | Involving: <entities> | <why>". The fact is the
 *  lesson; the rest is provenance, kept whole in the tooltip. */
const fact = (text: string): string => text.split(" | ")[0];

const SIMULATED = (
  <span className="ml-1.5 border border-nc-line px-1 font-data text-[9px] uppercase tracking-[0.14em] text-nc-lo" title="Seeded demo record: invented lab or preference history, not a measurement">
    simulated
  </span>
);

export function Memory({ m }: { m: DashboardModel }) {
  const mem = m.memory;
  return (
    <Section label="Memory" index="09">
      {!mem.reported ? (
        <p className="font-data text-[11px] leading-relaxed text-nc-lo">
          {!m.hasRun
            ? NOT_REPORTED
            : mem.pending
              ? "The Orchestrator has not recalled earlier investigations yet."
              : "This run did not report memory: research memory was switched off."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-10 xl:grid-cols-2">
        <div>
          <div className="grid grid-cols-3 gap-4">
            <Numeral value={mem.recalled} label="Recalled" />
            <Numeral value={mem.lessons} label="Lessons" tone={mem.lessons ? "warn" : "idle"} />
            <Numeral value={mem.retained} label="Retained" />
          </div>

          {mem.error && (
            <p className="mt-4 border-l-2 pl-3 font-data text-[10.5px] leading-snug text-nc-mid" style={{ borderColor: TONE_COLOR.warn }}>
              Memory was unreachable, so this run did not learn from earlier investigations: {mem.error}
            </p>
          )}

          <div className="mt-5 border-t border-nc-line pt-3">
            <div className="font-data text-[10px] uppercase tracking-[0.16em] text-nc-lo">
              Changed this run&apos;s ranking
            </div>
            {mem.applied === null ? (
              <p className="mt-2 font-data text-[10.5px] leading-snug text-nc-lo">
                {mem.pending ? "The Critic has not weighed the routes against these lessons yet." : NOT_REPORTED}
              </p>
            ) : mem.applied.length === 0 ? (
              <p className="mt-2 font-data text-[10.5px] leading-snug text-nc-lo">
                {mem.recalled
                  ? "Nothing recalled applied to these routes: no step reuses a flagged transformation."
                  : "Nothing was recalled, so there was nothing to apply."}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {mem.applied.map((a, i) => (
                  <li key={`${a.routeId}-${a.step}-${i}`} className="border-l-2 pl-3" style={{ borderColor: TONE_COLOR.bad }}>
                    <div className="font-data text-[10px] uppercase tracking-[0.14em] text-nc-hi">
                      Route {a.routeId}
                      {a.step === null ? "" : ` · step ${a.step}`}
                      {a.simulated && SIMULATED}
                    </div>
                    <p className="mt-1 text-[10.5px] leading-snug text-nc-mid" title={a.issue}>{fact(a.issue)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

          {mem.items.length > 0 && (
            <div className="mt-5 border-t border-nc-line pt-3 xl:mt-0 xl:border-t-0 xl:pt-0">
              <div className="font-data text-[10px] uppercase tracking-[0.16em] text-nc-lo">Recalled</div>
              <ul className="mt-2 space-y-2">
                {mem.items.map((item) => (
                  <li key={item.id} className="flex gap-2">
                    <span
                      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0"
                      style={{ background: item.flagged ? TONE_COLOR.warn : "rgb(var(--nc-line-strong))" }}
                      title={item.flagged ? "a flagged transformation to avoid" : "an earlier outcome"}
                    />
                    <p className="text-[10.5px] leading-snug text-nc-mid" title={item.text}>
                      {fact(item.text)}
                      {item.simulated && SIMULATED}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
