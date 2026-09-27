"use client";

// RESEARCH MEMORY: what earlier investigations contributed to this run (Hindsight).
//
// Three facts, in the order that matters: how much was recalled, which recalled lessons actually marked a step (the
// only part that changed a score - grouped, since one lesson often marks several routes), and what this run handed
// back. A recalled memory that changed nothing is still listed: it was read and found not to apply.
//
// A memory the pipeline could not have produced (a lab outcome, a chemist's preference) is seeded for the demo and
// tagged; it reads SIMULATED here and nothing dresses it up as measured. "Not known yet" is not "none": mid-run the
// card says what it is waiting for. Memory being unreachable is not a zero either: the run went on without it.
import React, { useMemo } from "react";
import { Brain } from "lucide-react";
import type { DashboardModel } from "@/lib/dashboard/model";
import { Card, NOT_REPORTED, SimBadge, StatusPill, TONE_COLOR } from "./ui";

/** Hindsight serialises a fact as "<fact> | When: <date> | Involving: <entities> | <why>". The fact is the lesson;
 *  the rest is provenance, kept whole in the tooltip. */
const fact = (text: string): string => text.split(" | ")[0];

/** The critic prefixes every lesson with how often it was flagged; the lesson itself follows the colon. */
const lesson = (issue: string): string => fact(issue.replace(/^This transformation was flagged in \d+ earlier investigation\(s\)( \(simulated demo record\))?: /, ""));

function Count({ value, label }: { value: number | null; label: string }) {
  return (
    <div>
      <div className="font-data text-[24px] leading-none tabular-nums" style={{ color: value === null ? TONE_COLOR.dim : value === 0 ? TONE_COLOR.idle : TONE_COLOR.ok }}>
        {value ?? "—"}
      </div>
      <div className="mt-1.5 text-[10.5px] text-nc-lo">{label}</div>
    </div>
  );
}

export function Memory({ m }: { m: DashboardModel }) {
  const mem = m.memory;
  const groups = useMemo(() => {
    const by = new Map<string, { text: string; simulated: boolean; routes: number[] }>();
    for (const a of mem.applied ?? []) {
      const key = lesson(a.issue);
      const g = by.get(key) ?? { text: key, simulated: a.simulated, routes: [] };
      if (!g.routes.includes(a.routeId)) g.routes.push(a.routeId);
      by.set(key, g);
    }
    return [...by.values()];
  }, [mem.applied]);

  const state = !mem.reported ? null : mem.error ? { tone: "bad" as const, text: "Unreachable" } : mem.pending ? { tone: "run" as const, text: "Recalling" } : { tone: "ok" as const, text: "Hindsight" };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-nc-cyan" aria-hidden /> Research memory
        </span>
      }
      aside={state && <StatusPill tone={state.tone} live={state.tone === "run"}>{state.text}</StatusPill>}
    >
      {!mem.reported ? (
        <p className="text-[12px] leading-relaxed text-nc-lo">
          {!m.hasRun ? NOT_REPORTED : mem.pending ? "The Orchestrator has not recalled earlier investigations yet." : "This run did not report memory: research memory was switched off."}
        </p>
      ) : (
        <>
          <p className="text-[12px] leading-relaxed text-nc-mid">Earlier investigations this run learned from, and what it handed back for the next one.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Count value={mem.recalled} label="Recalled" />
            <Count value={mem.lessons} label="Lessons" />
            <Count value={mem.retained} label="Retained" />
          </div>

          {mem.error && (
            <p className="mt-3 rounded-md border px-2.5 py-2 text-[11px] leading-snug text-nc-mid" style={{ borderColor: TONE_COLOR.bad }}>
              Memory was unreachable, so this run did not learn from earlier investigations: {mem.error}
            </p>
          )}

          <div className="mt-4 font-data text-[10px] uppercase tracking-[0.18em] text-nc-lo">Changed this run&apos;s ranking</div>
          {mem.applied === null ? (
            <p className="mt-1.5 text-[11.5px] text-nc-lo">{mem.pending ? "The Critic has not weighed the routes against these lessons yet." : NOT_REPORTED}</p>
          ) : groups.length === 0 ? (
            <p className="mt-1.5 text-[11.5px] text-nc-lo">
              {mem.recalled ? "Nothing recalled applied here: no route reuses a flagged transformation." : "Nothing was recalled, so there was nothing to apply."}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {groups.map((g) => (
                <li key={g.text} className="rounded-lg border px-2.5 py-2" style={{ borderColor: `color-mix(in srgb, ${TONE_COLOR.bad} 50%, transparent)` }}>
                  <div className="font-data text-[10px] uppercase tracking-[0.12em] text-nc-hi">
                    Route{g.routes.length === 1 ? "" : "s"} {g.routes.join(", ")} ranked down
                    {g.simulated && <SimBadge />}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-nc-mid" title={g.text}>{g.text}</p>
                </li>
              ))}
            </ul>
          )}

          {mem.items.length > 0 && (
            <details className="mt-3 group">
              <summary className="nc-focus cursor-pointer font-data text-[10px] uppercase tracking-[0.18em] text-nc-lo hover:text-nc-mid">
                Recalled ({mem.items.length} shown)
              </summary>
              <ul className="mt-2 max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                {mem.items.map((item) => (
                  <li key={item.id} className="flex gap-2">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: item.flagged ? TONE_COLOR.warn : "rgb(var(--nc-line-strong))" }} title={item.flagged ? "a flagged transformation to avoid" : "an earlier outcome"} />
                    <p className="text-[11px] leading-snug text-nc-mid" title={item.text}>
                      {fact(item.text)}
                      {item.simulated && <SimBadge />}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
