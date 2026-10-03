"use client";

// HISTORY: every investigation, newest first, grouped by the day it last moved.
//
// Tapping one reopens it: the provider loads that run's events and final package, and the research
// screen shows the conversation it was, with the thread this device kept for it. A question asked there
// is grounded in that run, which is what continuing research means here - structured context and the
// memory that applies, not a transcript replayed at the model.
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { dayLabel, jobState } from "@/lib/mobile/assistant";
import { useNeo, type DemoSnapshot } from "@/lib/store/NeoProvider";
import { readInvestigations } from "@/lib/mobile/cache";
import { Empty, Row, ScreenHeader, StatusPill } from "./ui";

const STATE_TONE = { completed: "ok", failed: "bad", running: "run", queued: "dim" } as const;

export function History() {
  const router = useRouter();
  const neo = useNeo();
  const [saved, setSaved] = useState<DemoSnapshot[]>([]);
  useEffect(() => setSaved(readInvestigations()), []);

  const recalledBy = useMemo(() => {
    const by = new Map<string, number>();
    for (const snapshot of saved) {
      const count = snapshot.run.result?.memory?.recalled;
      if (count !== undefined) by.set(snapshot.project.id, count);
    }
    return by;
  }, [saved]);

  const projects = neo.projects;
  const groups = useMemo(() => {
    if (projects.state !== "ok") return [];
    const out: { day: string; items: typeof projects.data }[] = [];
    for (const p of projects.data) {
      const day = dayLabel(p.updated_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(p);
      else out.push({ day, items: [p] });
    }
    return out;
  }, [projects]);

  const open = async (id: string) => {
    await neo.selectProject(id);
    router.push("/assistant/research");
  };

  return (
    <div>
      <ScreenHeader title="Research history" sub="Reopen an investigation to read it again or carry it on." />

      {groups.length === 0 ? (
        <Empty
          title={
            neo.projects.state === "offline"
              ? "History is not reachable right now."
              : neo.projects.state === "loading"
                ? "Loading…"
                : "Nothing investigated yet."
          }
          detail={neo.projects.state === "offline" ? "Previously opened investigations stay readable on this device." : undefined}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.day} aria-labelledby={`m-day-${g.day}`}>
              <h2 id={`m-day-${g.day}`} className="m-label mb-2.5">
                {g.day}
              </h2>
              <ul className="space-y-2">
                {g.items.map((p) => {
                  const state = jobState(p);
                  const n = recalledBy.get(p.id);
                  const target = p.target_query && p.target_query !== p.name ? p.target_query : null;
                  return (
                    <li key={p.id}>
                      <Row
                        onClick={() => void open(p.id)}
                        title={p.name}
                        detail={[target, n ? `${n} memor${n === 1 ? "y" : "ies"} recalled` : null].filter(Boolean).join(" · ") || undefined}
                        aside={
                          <StatusPill tone={STATE_TONE[state]} live={state === "running"}>
                            {state === "queued" ? "Queued" : state.charAt(0).toUpperCase() + state.slice(1)}
                          </StatusPill>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
