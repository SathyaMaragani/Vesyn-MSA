"use client";

// THE SCIENTIFIC COMMAND DASHBOARD: "what is happening across Vesyn right now?"
//
// A 2D editorial page, deliberately not a grid of equal cards: one large section (the current research), one tall
// one (the workflow), unboxed lists (events, agents), a warm specimen sheet (the route) and small instruments
// (health, alerts). Every figure is derived by lib/dashboard/model.ts from the folded events, the evaluator's
// package and the health probes; a component here only renders. The 3D lab is NOT embedded: the lab status is a
// drawing, and ENTER LAB is a transition into its own page.
import React, { useMemo } from "react";
import { buildDashboard } from "@/lib/dashboard/model";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import { Agents } from "./Agents";
import { Evidence } from "./Evidence";
import { Feed } from "./Feed";
import { Alerts, Health } from "./Health";
import { Hero } from "./Hero";
import { LabPlan } from "./LabPlan";
import { Quick } from "./Quick";
import { RouteSheet } from "./RouteSheet";
import { Synthesis } from "./Synthesis";
import { Workflow } from "./Workflow";
import { useServices } from "./useServices";

export function Dashboard() {
  const neo = useNeo();
  const result = useRunResult();
  const services = useServices();
  const project = neo.projects.state === "ok" ? (neo.projects.data.find((p) => p.id === neo.projectId) ?? null) : null;

  const model = useMemo(
    () => buildDashboard({ run: neo.run, result, agents: neo.agents, project, services }),
    [neo.run, result, neo.agents, project, services],
  );

  return (
    <div className="grid grid-cols-12 gap-x-8 gap-y-12">
      <div className="col-span-12 xl:col-span-8">
        <Hero m={model} />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <Workflow m={model} />
      </div>

      <div className="col-span-12 xl:col-span-5">
        <Feed m={model} live={neo.socket === "live" && model.phase === "running"} />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <Agents m={model} />
      </div>
      <div className="col-span-12 xl:col-span-3">
        <LabPlan m={model} />
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Synthesis m={model} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        <RouteSheet m={model} />
      </div>
      <div className="col-span-12 xl:col-span-3">
        <Evidence m={model} />
      </div>

      <div className="col-span-12 xl:col-span-5">
        <Health services={services} />
      </div>
      <div className="col-span-12 xl:col-span-4">
        <Alerts alerts={model.alerts} />
      </div>
      <div className="col-span-12 xl:col-span-3">
        <Quick m={model} />
      </div>
    </div>
  );
}
