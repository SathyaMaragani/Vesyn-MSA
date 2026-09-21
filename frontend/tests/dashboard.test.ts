import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDashboard, eventHref } from "../src/lib/dashboard/model.ts";
import { isProblem, serviceStatuses, type ServiceProbes } from "../src/lib/dashboard/services.ts";
import { buildAgentViews } from "../src/lib/events/agentViews.ts";
import { emptyRun, foldAll } from "../src/lib/events/fold.ts";
import type { RunResult } from "../src/types/runs.ts";
import { ev, sampleRun } from "./fixtures.ts";

const build = (events: ReturnType<typeof sampleRun>, result: RunResult | null = null, health: "online" | "offline" = "online") => {
  const run = foldAll("run_a", events);
  const agents = buildAgentViews({ roster: null, run, health });
  return buildDashboard({ run, result, agents, project: null, services: [] });
};

describe("dashboard model: no run", () => {
  it("says NO RUN and invents nothing", () => {
    const run = emptyRun(null);
    const m = buildDashboard({ run, result: null, agents: buildAgentViews({ roster: null, run, health: "online" }), project: null, services: [] });
    assert.equal(m.hasRun, false);
    assert.equal(m.statusWord, "NO RUN");
    assert.equal(m.progress.pct, null, "no percentage without a run");
    assert.equal(m.synthesis.generated, null, "NOT REPORTED, not 0");
    assert.equal(m.synthesis.validated, null);
    assert.equal(m.route, null);
    assert.equal(m.feed.length, 0);
    assert.equal(m.evidence.uncertainty, null);
    assert.equal(m.evidence.summary, null);
    assert.equal(m.alerts.length, 0);
    assert.equal(m.currentAgent, null);
    assert.equal(m.stages.length, 7);
    assert.ok(m.stages.every((s) => s.state === "pending" && s.detail === null));
  });
});

describe("dashboard model: a real event sequence", () => {
  it("counts routes, validation and rejection only from events", () => {
    const m = build(sampleRun());
    assert.equal(m.hasRun, true);
    assert.equal(m.target.smiles, "CC(=O)Oc1ccccc1C(=O)O");
    assert.ok(m.synthesis.generated !== null && m.synthesis.generated >= 2, "both attempts' routes are counted");
    assert.ok(m.synthesis.rejected !== null && m.synthesis.rejected >= 1, "the flagged route is a rejection");
    assert.equal(m.synthesis.attempts, 2);
    assert.equal(m.loop.taken, true);
    assert.equal(m.loop.count, 1);
    assert.match(m.loop.reason ?? "", /flagged/);
    assert.ok((m.synthesis.alternatives ?? 0) >= 1, "the attempt-2 route is an alternative");
    assert.equal(m.statusWord, "COMPLETED");
    assert.equal(m.progress.pct, 100);
  });
  it("mid-run: progress is the share of stages that reported completion, and the replan branch is live", () => {
    const events = sampleRun().slice(0, 15); // through REPLAN_STARTED
    const m = build(events);
    assert.equal(m.statusWord, "ACTIVE");
    assert.equal(m.loop.active, true);
    assert.equal(m.stages.find((s) => s.id === "replanner")?.state, "active");
    assert.ok(m.progress.pct !== null && m.progress.pct < 100);
    assert.ok(m.alerts.some((a) => a.title.startsWith("REPLANNING")));
    assert.ok(m.alerts.some((a) => a.title === "VALIDATION FAILED"), "the flagged route is surfaced");
  });
  it("a run that needed no replan shows the replanner as not needed, and does not count it", () => {
    const events = sampleRun().filter((e) => e.type !== "REPLAN_STARTED" && e.type !== "REPLAN_COMPLETED" && e.agent_id !== "replanner");
    const m = build(events);
    const rp = m.stages.find((s) => s.id === "replanner");
    assert.equal(m.loop.taken, false);
    if (m.phase === "completed") assert.equal(rp?.state, "skipped");
    assert.ok(m.progress.total <= 6);
  });
  it("the feed is newest-first, drops housekeeping events, and links to the page that shows each event", () => {
    const m = build(sampleRun());
    for (let i = 1; i < m.feed.length; i++) assert.ok(m.feed[i - 1].seq > m.feed[i].seq);
    assert.ok(m.feed.every((f) => !["AGENT_STATUS_CHANGED", "TOOL_REQUESTED"].includes(f.tag)));
    const events = sampleRun();
    const route = events.find((e) => e.type === "ROUTE_GENERATED");
    const crit = events.find((e) => e.type === "CRITIQUE_CREATED");
    const molecule = events.find((e) => e.type === "MOLECULE_RECEIVED");
    if (route) assert.equal(eventHref(route), "/lab/routes");
    if (crit) assert.equal(eventHref(crit), "/lab/intelligence");
    if (molecule) assert.equal(eventHref(molecule), "/lab/chemistry");
  });
  it("a failed run is a failed run: the backend's own error is the alert, nothing is dressed up", () => {
    const events = [
      ev("RUN_STARTED", 1, { project_id: "p", query: "x", params: { top_n: 5, iteration_limit: 100 } }),
      ev("TASK_CREATED", 2, { title: "Generate routes", attempt: 1 }, { agent: "retro", task: "t" }),
      ev("TASK_STARTED", 3, {}, { agent: "retro", task: "t" }),
      ev("TASK_FAILED", 4, { error: "RuntimeError: AiZynthFinder is not loaded" }, { agent: "retro", task: "t" }),
      ev("PROJECT_FAILED", 5, { project_id: "p", error: "RuntimeError: AiZynthFinder is not loaded" }),
    ];
    const m = build(events);
    assert.equal(m.statusWord, "FAILED");
    assert.equal(m.stages.find((s) => s.id === "retro")?.state, "failed");
    assert.equal(m.alerts[0].title, "RUN FAILED");
    assert.match(m.alerts[0].detail, /AiZynthFinder is not loaded/);
    assert.equal(m.synthesis.generated, 0, "a real zero: there was a run and no route was generated");
    assert.equal(m.route, null, "no route is fabricated");
  });
  it("the route preview and the evidence summary come only from the evaluator's package", () => {
    const tree = { molecule_smiles: "CC(=O)Oc1ccccc1C(=O)O", is_stock_available: false, reactions: [{ reactants: [{ molecule_smiles: "CC(=O)OC(C)=O", is_stock_available: true, reactions: [] }, { molecule_smiles: "OC(=O)c1ccccc1O", is_stock_available: false, reactions: [] }], reaction_smiles: "a>>b", template_used: 1, template_hash: null, template_smarts: null, template_occurrence: 3, score: 0.91, classification: "acylation" }] };
    const route = { route_id: 4, rank: 1, db_id: "r4", attempt: 1, number_of_reactions: 1, state_score: 0.9, score: 0.7, score_breakdown: { assessment: 1, structural: 1, evidence: 1, search: 1, brevity: 1 }, tree, assessment: { summary: "SUPPORTED", label: "s", critical_steps: [], flags: [] }, critique: { route_id: 4, issues: [], strengths: [], counts: {}, headline: "" }, starting_materials: [], evidence_summary: { steps: 1, steps_with_experimental_evidence: 0, steps_with_similar_evidence: 0, steps_predicted: 0, steps_without_evidence: 1, evidence_coverage: 0, distinct_sources: 0 }, signals: {} };
    const result = { recommended_route_id: 4, ranked_routes: [route], limitations: ["Templates are from USPTO."], recommendation: "Route 4", target: { canonical_smiles: "CC(=O)Oc1ccccc1C(=O)O", matched_name: "aspirin" } } as unknown as RunResult;
    assert.equal(build(sampleRun()).route, null, "no package, no preview");
    const m = build(sampleRun(), result);
    assert.equal(m.route?.routeId, 4);
    assert.equal(m.route?.recommended, true);
    assert.deepEqual(m.route?.precursors.map((p) => [p.smiles, p.inStock]), [["CC(=O)OC(C)=O", true], ["OC(=O)c1ccccc1O", false]]);
    assert.equal(m.route?.reactionScore, 0.91);
    assert.equal(m.evidence.summary?.steps_without_evidence, 1);
    assert.ok(m.alerts.some((a) => a.title === "EVIDENCE INCOMPLETE"), "no direct precedent is flagged, not hidden");
    assert.match(m.evidence.uncertainty ?? "", /no probability or confidence score/);
    assert.equal(m.target.name, "Aspirin", "the name comes from the events");
  });
});

describe("system health is what the backend answered", () => {
  const ok = <T,>(data: T) => ({ status: "ok" as const, data });
  const base = { health: "online" as const, socket: "live" as const, runId: "run_a", projects: { state: "ok" as const, data: [] }, apiBase: "http://x:1" };
  const probes = (p: Partial<ServiceProbes>): ServiceProbes => ({ retro: null, evidence: null, library: null, ...p });
  const by = (rows: ReturnType<typeof serviceStatuses>, id: string) => rows.find((r) => r.id === id)!;

  it("AiZynthFinder not loaded shows OFFLINE with the backend's reason", () => {
    const rows = serviceStatuses({ ...base, probes: probes({ retro: { status: "error", code: 503, message: "model failed to load: FileNotFoundError uspto_model.onnx" } }) });
    assert.equal(by(rows, "retro").state, "offline");
    assert.equal(by(rows, "retro").word, "OFFLINE");
    assert.match(by(rows, "retro").detail ?? "", /model failed to load/);
    assert.ok(isProblem(by(rows, "retro")));
  });
  it("a loaded model is ONLINE with its load time; a service that says model_loaded false is OFFLINE", () => {
    assert.equal(by(serviceStatuses({ ...base, probes: probes({ retro: ok({ status: "ready", model_loaded: true, load_time_seconds: 15.1 }) }) }), "retro").detail, "model loaded in 15.1 s");
    assert.equal(by(serviceStatuses({ ...base, probes: probes({ retro: ok({ status: "ready", model_loaded: false }) }) }), "retro").state, "offline");
  });
  it("the stream is IDLE without a run, CONNECTED when live, RECONNECTING when dropped", () => {
    assert.equal(by(serviceStatuses({ ...base, runId: null, socket: "idle", probes: probes({}) }), "stream").word, "IDLE");
    assert.equal(by(serviceStatuses({ ...base, probes: probes({}) }), "stream").word, "CONNECTED");
    assert.equal(by(serviceStatuses({ ...base, socket: "reconnecting", probes: probes({}) }), "stream").word, "RECONNECTING");
  });
  it("with the API offline nothing else is claimed to be up", () => {
    const rows = serviceStatuses({ ...base, health: "offline", projects: { state: "offline" }, probes: probes({}) });
    for (const r of rows) assert.equal(r.state, "offline", r.id);
  });
  it("an evidence index that is not configured is a warning, not a failure and not 'online'", () => {
    const rows = serviceStatuses({ ...base, probes: probes({ evidence: ok({ available: false, provider_display_name: "no evidence source configured" }) }) });
    assert.equal(by(rows, "evidence").word, "NOT CONFIGURED");
    assert.equal(by(rows, "evidence").state, "warn");
  });
  it("a chemical library that errors shows the error, and unprobed services are CHECKING", () => {
    const rows = serviceStatuses({ ...base, probes: probes({ library: { status: "error", code: 500, message: "500 Internal Server Error" } }) });
    assert.equal(by(rows, "library").word, "ERROR");
    assert.equal(by(rows, "retro").word, "CHECKING");
  });
  it("service problems become alerts on the dashboard", () => {
    const rows = serviceStatuses({ ...base, probes: probes({ retro: { status: "error", code: 503, message: "AiZynthFinder is not loaded" } }) });
    const run = emptyRun(null);
    const m = buildDashboard({ run, result: null, agents: buildAgentViews({ roster: null, run, health: "online" }), project: null, services: rows });
    const a = m.alerts.find((x) => x.title === "SERVICE UNAVAILABLE");
    assert.ok(a);
    assert.match(a.detail, /AiZynthFinder — AiZynthFinder is not loaded/);
  });
});
