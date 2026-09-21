"use client";

import React, { useMemo, useState } from "react";
import { InProgress, WorkspaceGate } from "@/components/lab/WorkspaceGate";
import { Field, NotReported, Panel, TONE_TEXT, Tag, cx } from "@/components/ui/primitives";
import type { Tone } from "@/lib/events/activity";
import { flattenSteps, leafMolecules, type StepView } from "@/lib/events/routeSteps";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import type { AssessmentSummary } from "@/types/events";
import type { RankedRoute, StepValidation } from "@/types/routes";
import { RouteGraph } from "./RouteGraph";

export const ASSESSMENT_TONE: Record<string, Tone> = {
  STRONGLY_SUPPORTED: "ok",
  SUPPORTED: "ok",
  INSUFFICIENT_EVIDENCE: "warn",
  REVIEW_REQUIRED: "bad",
};

const VALIDATION_TONE: Record<string, Tone> = { MATCH: "ok", PARTIAL_MATCH: "warn", MISMATCH: "bad", MODEL_OUTPUT_INVALID: "bad" };
const validationTone = (s?: string): Tone => (s ? (VALIDATION_TONE[s] ?? "idle") : "dim");

function Check({ label, v }: { label: string; v?: StepValidation }) {
  return (
    <div className="min-w-0">
      <div className="nc-label">{label}</div>
      {v ? (
        <>
          <Tag tone={validationTone(v.status)}>{v.status}</Tag>
          {v.model && <div className="mt-0.5 truncate font-data text-[10px] text-nc-lo" title={v.model}>{v.model}</div>}
          {v.predicted_products && v.predicted_products.length > 0 && v.status !== "MATCH" && (
            <div className="mt-0.5 break-all font-data text-[10px] text-nc-lo" title="what the model predicted instead">predicted: {v.predicted_products[0]}</div>
          )}
          {v.error && <div className="mt-0.5 text-[11px] text-nc-warn">{v.error}</div>}
        </>
      ) : (
        <NotReported />
      )}
    </div>
  );
}

function StepCard({ step, route }: { step: StepView; route: RankedRoute }) {
  const r = step.reaction;
  const issues = route.critique.issues.filter((i) => i.step === step.index);
  const summary = String(r.assessment?.summary === "STRONG_SUPPORT" ? "STRONGLY_SUPPORTED" : (r.assessment?.summary ?? ""));
  return (
    <div className="border border-nc-line bg-nc-panel/40 p-3">
      <div className="flex items-center gap-2">
        <span className="font-data text-[11px] text-nc-cyan">STEP {step.index}</span>
        {summary ? <Tag tone={ASSESSMENT_TONE[summary] ?? "idle"}>{summary}</Tag> : <NotReported />}
      </div>
      <div className="mt-1 break-all font-data text-[11px] text-nc-mid">{r.reaction_smiles || <NotReported />}</div>
      <div className="mt-2 grid grid-cols-4 gap-3">
        <Check label="RDKit template check" v={r.structural_validation} />
        <Check label="Forward model" v={r.forward_validation} />
        <div>
          <div className="nc-label">Literature</div>
          {r.evidence ? (
            <Tag tone={r.evidence.evidence_level === "experimental" ? "ok" : r.evidence.evidence_level === "similar_experimental" ? "warn" : "dim"}>{r.evidence.evidence_level}</Tag>
          ) : (
            <NotReported />
          )}
        </div>
        <Field label="Template library count" value={r.template_occurrence} mono />
      </div>
      {r.assessment?.flags && r.assessment.flags.length > 0 && (
        <div className="mt-2 font-data text-[10px] text-nc-warn">flags: {r.assessment.flags.join(", ")}</div>
      )}
      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-nc-line pt-2">
          {issues.map((i, n) => (
            <li key={n} className="text-[12px] text-nc-mid">
              <span className={cx("mr-2 font-data text-[10px] uppercase", TONE_TEXT[i.severity === "high" ? "bad" : i.severity === "medium" ? "warn" : "idle"])}>{i.severity}</span>
              <span className="mr-1 font-data text-[10px] text-nc-lo">[{i.source}]</span>
              {i.issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RouteDetail({ route, recommended }: { route: RankedRoute; recommended: boolean }) {
  const steps = useMemo(() => flattenSteps(route.tree), [route]);
  const leaves = useMemo(() => leafMolecules(route.tree), [route]);
  // Open on the first step the validator flagged - the failure is the first thing you see.
  const firstFlagged = steps.find((s) => s.reaction.assessment?.summary === "REVIEW_REQUIRED")?.index ?? steps[0]?.index ?? null;
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? firstFlagged;
  const step = steps.find((s) => s.index === shown) ?? null;
  const routeLevel = route.critique.issues.filter((i) => i.step === null);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-data text-sm text-nc-hi">Route {route.route_id}</span>
        <Tag tone={ASSESSMENT_TONE[route.assessment.summary] ?? "idle"}>{route.assessment.label}</Tag>
        {recommended && <Tag tone="ok">recommended</Tag>}
        <span className="font-data text-[11px] text-nc-lo">
          rank {route.rank} · attempt {route.attempt} · {route.number_of_reactions} step(s)
        </span>
      </div>

      <RouteGraph tree={route.tree} selectedStep={shown} onSelectStep={setPicked} />

      {step ? <StepCard step={step} route={route} /> : <NotReported />}

      <div className="grid grid-cols-4 gap-4 border border-nc-line bg-nc-panel/50 p-3">
        <Field label="Ranking score (heuristic)" value={route.score} mono />
        <Field label="Search state score" value={route.state_score} mono />
        <Field label="Starting materials" value={`${leaves.filter((l) => l.inStock).length} / ${leaves.length} in stock`} mono />
        <Field label="Critic issues" value={route.critique.headline} />
        <div className="col-span-4 text-[11px] text-nc-lo">
          The ranking score orders candidates by the signals available. It is not a yield or feasibility probability.{" "}
          <span className="font-data">{Object.entries(route.score_breakdown).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
        </div>
      </div>

      {routeLevel.length > 0 && (
        <ul className="space-y-1 text-[12px] text-nc-mid">
          {routeLevel.map((i, n) => (
            <li key={n}>
              <span className={cx("mr-2 font-data text-[10px] uppercase", TONE_TEXT[i.severity === "high" ? "bad" : i.severity === "medium" ? "warn" : "idle"])}>{i.severity}</span>
              {i.issue}
            </li>
          ))}
        </ul>
      )}
      {route.critique.strengths.length > 0 && (
        <div>
          <div className="nc-label mb-1">Strengths noted by the critic</div>
          <ul className="list-inside list-disc text-[12px] text-nc-mid">{route.critique.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function RoutesWorkspace() {
  const { run, runRecord } = useNeo();
  const result = useRunResult();
  const [sel, setSel] = useState<number | null>(null);
  const routes = result?.ranked_routes ?? [];
  const chosen = routes.find((r) => r.rank === (sel ?? routes[0]?.rank)) ?? null;

  return (
    <WorkspaceGate>
      {result && (
        <div className={cx("border-b px-4 py-2 text-[12px]", result.recommended_route_id === null ? "border-nc-warn/40 bg-nc-warn/[0.06] text-nc-warn" : "border-nc-ok/40 bg-nc-ok/[0.06] text-nc-ok")}>
          {result.recommendation}
        </div>
      )}
      {!result && (runRecord.state === "loading" || run.phase === "running") && (
        <>
          <InProgress what="Ranked routes and per-step validation" />
          {run.routeOrder.length > 0 && (
            <ul className="mx-4 mb-4 space-y-1 font-data text-[11px] text-nc-mid">
              {run.routeOrder.map((k) => {
                const r = run.routes[k];
                return (
                  <li key={k}>
                    Route {r.routeId} · attempt {r.attempt} · {r.steps ?? "?"} step(s) ·{" "}
                    {r.validation ? r.validation.label : r.validationStarted ? "validating…" : "awaiting validation"}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {result && routes.length === 0 && (
        <div className="p-6 text-[13px] text-nc-mid">
          No solved route was found: {result.verdict.reason} Attempts: {result.attempts.length}.
        </div>
      )}
      {result && routes.length > 0 && (
        <div className="grid min-h-0 grid-cols-[16rem_1fr]">
          <ul className="border-r border-nc-line">
            {routes.map((r) => (
              <li key={r.db_id}>
                <button
                  type="button"
                  onClick={() => setSel(r.rank)}
                  className={cx("nc-focus w-full border-b border-nc-line/60 px-3 py-2 text-left hover:bg-nc-panel-2", chosen?.rank === r.rank && "bg-nc-cyan/[0.07]")}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-data text-[12px] text-nc-hi">#{r.rank} · route {r.route_id}</span>
                    <span className="font-data text-[11px] text-nc-lo">{r.score}</span>
                  </div>
                  <div className={cx("font-data text-[10px] uppercase tracking-wider", TONE_TEXT[ASSESSMENT_TONE[r.assessment.summary as AssessmentSummary] ?? "idle"])}>{r.assessment.label}</div>
                  <div className="font-data text-[10px] text-nc-lo">{r.number_of_reactions} step(s) · attempt {r.attempt}</div>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0">{chosen && <RouteDetail key={chosen.db_id} route={chosen} recommended={chosen.route_id === result.recommended_route_id} />}</div>
        </div>
      )}
      {result && (
        <Panel title="Search attempts" className="border-t border-nc-line">
          <table className="w-full font-data text-[11px]">
            <thead><tr className="text-left text-nc-lo"><th className="px-4 py-1 font-normal">#</th><th className="font-normal">Budget</th><th className="font-normal">Solved</th><th className="font-normal">Time</th><th className="font-normal">Verdict</th></tr></thead>
            <tbody>
              {result.attempts.map((a) => (
                <tr key={a.attempt} className="border-t border-nc-line/60 text-nc-mid">
                  <td className="px-4 py-1">{a.attempt}</td>
                  <td>{a.iteration_limit} it · top {a.top_n}</td>
                  <td>{a.solved_routes_found}</td>
                  <td>{a.search_time_seconds}s</td>
                  <td className={a.verdict.passed ? "text-nc-ok" : "text-nc-warn"}>{a.verdict.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </WorkspaceGate>
  );
}
