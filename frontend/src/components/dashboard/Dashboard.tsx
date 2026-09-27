"use client";

// THE OVERVIEW: "what is this run, and what did the agents conclude?"
//
// Three columns: the target and its routes on the left, the team and its reasoning in the middle, one agent, the
// timeline and the research memory on the right. Every figure comes from lib/dashboard/model.ts (the run's state)
// and lib/dashboard/overview.ts (the evaluator's package, read for these panels); a component here only renders.
import React, { useCallback, useMemo } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { shownRoute } from "@/components/facility/facilityState";
import { buildDashboard } from "@/lib/dashboard/model";
import { agentDetail, keyEvidence, routeCards, targetFacts, timeline, whyRoute } from "@/lib/dashboard/overview";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import { Engine, Pipeline } from "./Engine";
import { Memory } from "./Memory";
import { CandidateRoutes, Provenance, WhyThisRoute } from "./Routes";
import { AgentDetails, Timeline } from "./SidePanels";
import { TargetCard } from "./TargetCard";
import { useServices } from "./useServices";

export function Dashboard() {
  const neo = useNeo();
  const result = useRunResult();
  const services = useServices();
  const project = neo.projects.state === "ok" ? (neo.projects.data.find((p) => p.id === neo.projectId) ?? null) : null;

  const m = useMemo(
    () => buildDashboard({ run: neo.run, result, agents: neo.agents, project, services }),
    [neo.run, result, neo.agents, project, services],
  );
  const routes = useMemo(() => routeCards(result, m.target.name), [result, m.target.name]);
  const why = useMemo(() => whyRoute(result, routes), [result, routes]);
  const facts = useMemo(() => targetFacts(result), [result]);
  const evidence = useMemo(() => keyEvidence(shownRoute(result)), [result]);
  const events = useMemo(() => timeline(neo.run, result), [neo.run, result]);
  const detailOf = useCallback((id: string) => agentDetail(id, neo.run, neo.agents, m.agents), [neo.run, neo.agents, m.agents]);

  // The design has no place for alarms, so only the ones that must not be missed get a line: a failed run, a failed
  // tool, a service down. Softer notes (incomplete evidence, no recommendation) live in their own panels.
  const alarms = m.alerts.filter((a) => a.tone === "bad");

  return (
    <div className="space-y-5">
      {alarms.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-nc-bad/50 bg-nc-bad/[0.06] px-4 py-2.5">
          <TriangleAlert className="h-4 w-4 text-nc-bad" aria-hidden />
          {alarms.map((a) =>
            a.href ? (
              <Link key={a.key} href={a.href} className="nc-focus font-data text-[11px] text-nc-hi hover:text-nc-bad">
                <span className="text-nc-bad">{a.title}</span> · {a.detail}
              </Link>
            ) : (
              <span key={a.key} className="font-data text-[11px] text-nc-hi">
                <span className="text-nc-bad">{a.title}</span> · {a.detail}
              </span>
            ),
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="grid grid-cols-1 content-start gap-5 xl:col-span-9 xl:grid-cols-9">
          <div className="xl:col-span-4">
            <TargetCard m={m} facts={facts} routes={routes} />
          </div>
          <div className="xl:col-span-5">
            <Engine m={m} />
          </div>
          <div className="xl:col-span-9">
            <Pipeline m={m} />
          </div>
          <div className="xl:col-span-6">
            <CandidateRoutes m={m} routes={routes} />
          </div>
          <div className="flex flex-col gap-5 xl:col-span-3">
            <WhyThisRoute why={why} m={m} answer={m.outcome} />
            <Provenance m={m} items={evidence} />
          </div>
        </div>

        <div className="flex flex-col gap-5 xl:col-span-3">
          <AgentDetails m={m} detailOf={detailOf} />
          <Timeline items={events} running={m.phase === "running"} />
          <Memory m={m} />
        </div>
      </div>
    </div>
  );
}
