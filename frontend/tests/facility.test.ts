import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTravel, sampleKeys, sampleTravel } from "../src/components/facility/cameraTravel.ts";
import { TONE_LOOK, buildFacilityState, projectionsOf, shownRoute, toneOf } from "../src/components/facility/facilityState.ts";
import { ARRIVAL, OVERVIEW, ZONES, ZONE_LIST, facing, port, yawOf, zonePose } from "../src/components/facility/layout.ts";
import { buildAgentViews } from "../src/lib/events/agentViews.ts";
import { foldAll } from "../src/lib/events/fold.ts";
import type { RunResult } from "../src/types/runs.ts";
import { ev, sampleRun } from "./fixtures.ts";

const stateFor = (events: ReturnType<typeof sampleRun>, health: "online" | "offline" = "online", result: RunResult | null = null) => {
  const run = foldAll("run_a", events);
  return buildFacilityState({ agents: buildAgentViews({ roster: null, run, health }), run, result });
};

describe("the facility plan", () => {
  it("every department's open side faces the core", () => {
    for (const z of ZONE_LIST) {
      if (z.id === "planner") continue;
      const [fx, fz] = facing(z);
      // local +z (its open side) after the yaw points where facing() says: toward the origin
      assert.ok(Math.abs(Math.sin(yawOf(z)) - fx) < 1e-9 && Math.abs(Math.cos(yawOf(z)) - fz) < 1e-9, z.id);
      assert.ok(fx * z.x + fz * z.z < 0, `${z.id} faces away from the core`);
    }
  });
  it("departments do not overlap each other, and stand clear of the planner's gallery (radius ~11.7 m)", () => {
    const flat = ZONE_LIST.filter((z) => z.id !== "planner");
    const radius = (z: (typeof flat)[number]) => Math.hypot(z.w, z.d) / 2 * 0.85;
    for (const z of flat) assert.ok(Math.hypot(z.x, z.z) - radius(z) > 11.8, `${z.id} intrudes on the gallery`);
    for (let i = 0; i < flat.length; i++)
      for (let j = i + 1; j < flat.length; j++) assert.ok(Math.hypot(flat[i].x - flat[j].x, flat[i].z - flat[j].z) > radius(flat[i]) + radius(flat[j]), `${flat[i].id} overlaps ${flat[j].id}`);
  });
  it("the planner stands one level up, on the gallery; the rest are on the ground", () => {
    assert.ok(ZONES.planner.floor > 3);
    for (const z of ZONE_LIST) if (z.id !== "planner") assert.equal(z.floor, 0);
    assert.ok(Math.hypot(ZONES.planner.x, ZONES.planner.z) > 8.6 && Math.hypot(ZONES.planner.x, ZONES.planner.z) < 11.7);
  });
  it("every conduit port is overhead, so cables run above the floor", () => {
    for (const z of ZONE_LIST) assert.ok(port(z)[1] > 3, z.id);
  });
  it("each department's camera looks at it from above the floor, never from inside the gallery's deck", () => {
    for (const z of ZONE_LIST) {
      const p = zonePose(z.id);
      assert.ok(p.pos[1] > 6, `${z.id} camera too low`);
      assert.ok(p.pos.every(Number.isFinite) && p.look.every(Number.isFinite));
    }
  });
  it("the arrival enters from outside the building and ends exactly on the overview", () => {
    assert.ok(ARRIVAL[0].pose.pos[2] > 50);
    const last = ARRIVAL[ARRIVAL.length - 1].pose;
    assert.deepEqual(last.pos, OVERVIEW.pos);
    assert.deepEqual(last.look, OVERVIEW.look);
    for (let i = 1; i < ARRIVAL.length; i++) assert.ok(ARRIVAL[i].at > ARRIVAL[i - 1].at);
  });
});

describe("cinematic camera moves", () => {
  const a = { pos: [0, 45, 53] as const, look: [0, 0, 0] as const };
  const b = { pos: [-14, 10.5, 15] as const, look: [-27, 1.5, -2] as const };
  it("starts on the first pose, ends on the second, and never jumps", () => {
    const t = planTravel(a, b, 10);
    assert.deepEqual(sampleTravel(t, 10).pose.pos, [0, 45, 53]);
    const end = sampleTravel(t, 10 + t.dur);
    assert.ok(end.done);
    assert.ok(end.pose.pos.every((v, i) => Math.abs(v - b.pos[i]) < 1e-9));
    let prev = sampleTravel(t, 10).pose.pos;
    for (let s = 0.02; s <= 1.0001; s += 0.02) {
      const p = sampleTravel(t, 10 + t.dur * s).pose.pos;
      assert.ok(Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) < 8, `jump at ${s}`);
      prev = p;
    }
  });
  it("long moves take longer and arc over the building; short moves stay calm", () => {
    const far = planTravel({ pos: [0, 10, 0], look: [0, 0, 0] }, { pos: [60, 10, 0], look: [60, 0, 0] }, 0);
    const near = planTravel({ pos: [0, 10, 0], look: [0, 0, 0] }, { pos: [3, 10, 0], look: [3, 0, 0] }, 0);
    assert.ok(far.dur > near.dur && far.dur <= 3.8 && near.dur >= 1.4);
    assert.ok(sampleTravel(far, far.dur / 2).pose.pos[1] > 12, "a long move should rise over the middle of the building");
  });
  it("the gaze turns a beat after the body", () => {
    const t = planTravel(a, b, 0);
    const early = sampleTravel(t, t.dur * 0.15).pose;
    const bodyDone = Math.abs(early.pos[0] - a.pos[0]) / Math.abs(b.pos[0] - a.pos[0]);
    const gazeDone = Math.abs(early.look[0] - a.look[0]) / Math.abs(b.look[0] - a.look[0]);
    assert.ok(gazeDone < bodyDone + 0.02);
  });
  it("keyframes pass through every key at its time", () => {
    for (const k of ARRIVAL) {
      const p = sampleKeys(ARRIVAL, k.at);
      assert.ok(p.pos.every((v, i) => Math.abs(v - k.pose.pos[i]) < 1e-6), `key at ${k.at}`);
    }
    assert.deepEqual(sampleKeys(ARRIVAL, -5).pos, ARRIVAL[0].pose.pos);
  });
});

describe("facility state is derived from real state and invents nothing", () => {
  it("with the API offline every department is dormant (the world does not pretend)", () => {
    const s = stateFor([], "offline");
    assert.equal(s.awake, false);
    for (const z of Object.values(s.zones)) assert.equal(z.tone, "dormant");
    assert.equal(s.target, null);
    assert.equal(s.routes.length, 0);
    assert.deepEqual(s.ranked, []);
  });
  it("tones map from activity with the palette's vocabulary", () => {
    assert.equal(toneOf("idle"), "idle");
    assert.equal(toneOf("working"), "active");
    assert.equal(toneOf("validating"), "processing");
    assert.equal(toneOf("replanning"), "processing");
    assert.equal(toneOf("failed"), "failed");
    assert.equal(toneOf("completed"), "complete");
    assert.equal(toneOf("idle", true), "warning");
    for (const t of Object.values(TONE_LOOK)) assert.ok(t.power > 0 && t.power <= 1);
    assert.ok(TONE_LOOK.active.power > TONE_LOOK.idle.power, "active areas must outshine idle ones");
  });
  it("a flagged route makes the validator a warning; a replan in flight is 'active'", () => {
    const events = sampleRun().slice(0, 14); // through VALIDATION_COMPLETED = REVIEW_REQUIRED (attempt 1)
    const s = stateFor(events);
    assert.equal(s.zones.validator.tone, "warning");
    assert.equal(s.current[0].assessment, "REVIEW_REQUIRED");
    const mid = stateFor(sampleRun().slice(0, 15)); // + REPLAN_STARTED
    assert.equal(mid.replan.active, true);
    assert.equal(mid.replan.count, 1);
    assert.match(mid.replan.last?.reason ?? "", /flagged/);
    const done = stateFor(sampleRun());
    assert.equal(done.replan.active, false);
    assert.equal(done.phase, "completed");
    assert.equal(done.current.length, 1);
    assert.equal(done.current[0].attempt, 2, "the halls work on the newest attempt");
    assert.equal(done.recommendedRouteId, 0);
  });
  it("the target and the run's budget come from the events, not from defaults", () => {
    const s = stateFor(sampleRun());
    assert.equal(s.target?.smiles, "CC(=O)Oc1ccccc1C(=O)O");
    assert.equal(s.target?.name, "Aspirin");
    assert.deepEqual(s.params, { topN: 5, iterationLimit: 100 });
    assert.ok(s.tasks.length >= 1);
  });
  it("a failed department carries the backend's own error text and is marked failed", () => {
    const events = [
      ev("RUN_STARTED", 1, { project_id: "p", query: "x", params: { top_n: 5, iteration_limit: 100 } }),
      ev("TASK_CREATED", 2, { title: "Generate routes", attempt: 1 }, { agent: "retro", task: "t" }),
      ev("TASK_STARTED", 3, {}, { agent: "retro", task: "t" }),
      ev("AGENT_STATUS_CHANGED", 4, { status: "WORKING", current_task: "t", station: "workstation" }, { agent: "retro" }),
      ev("TASK_FAILED", 5, { error: "RuntimeError: AiZynthFinder is not loaded" }, { agent: "retro", task: "t" }),
      ev("AGENT_STATUS_CHANGED", 6, { status: "FAILED", current_task: null, station: "workstation" }, { agent: "retro" }),
      ev("PROJECT_FAILED", 7, { project_id: "p", error: "RuntimeError: AiZynthFinder is not loaded" }),
    ];
    const s = stateFor(events);
    assert.equal(s.zones.retro.tone, "failed");
    assert.equal(s.zones.retro.error, "RuntimeError: AiZynthFinder is not loaded");
    assert.equal(s.zones.research.error, null, "nothing failed in research, so nothing is claimed");
    assert.equal(s.phase, "failed");
  });
  it("ranking, the recommended route and the displayed route come only from the evaluator's package", () => {
    assert.equal(stateFor(sampleRun()).ranked.length, 0, "no package, no ranking");
    assert.equal(shownRoute(null), null);
    const route = (id: number, rank: number) => ({ route_id: id, rank, db_id: `r${id}`, attempt: 1, number_of_reactions: 1, state_score: 0.9, score: 0.7 - rank / 10, score_breakdown: { assessment: 1, structural: 1, evidence: 1, search: 1, brevity: 1 }, tree: { molecule_smiles: "CCO", is_stock_available: false, reactions: [] }, assessment: { summary: "SUPPORTED" as const, label: "s", critical_steps: [], flags: [] }, critique: { route_id: id, issues: [], strengths: [], counts: {}, headline: "" }, starting_materials: [], evidence_summary: null, signals: {} });
    const result = { recommended_route_id: 7, ranked_routes: [route(3, 1), route(7, 2)] } as unknown as RunResult;
    const s = stateFor(sampleRun(), "online", result);
    assert.deepEqual(s.ranked.map((r) => [r.routeId, r.rank, r.recommended]), [[3, 1, false], [7, 2, true]]);
    assert.equal(shownRoute(result)?.route_id, 7, "the recommended route is the one on display, even if not ranked first");
    const none = { recommended_route_id: null, ranked_routes: [route(3, 1)] } as unknown as RunResult;
    assert.equal(shownRoute(none)?.route_id, 3);
    assert.equal(stateFor(sampleRun(), "online", none).ranked.every((r) => !r.recommended), true);
  });
});

describe("the projection stations show only real molecules", () => {
  const route = (id: number, sms: { smiles: string; in_stock: boolean }[]) => ({ route_id: id, rank: id, starting_materials: sms });
  it("nothing stands there without a result", () => {
    assert.deepEqual(projectionsOf(null), { kind: "none", items: [] });
    assert.equal(projectionsOf({} as RunResult).items.length, 0);
  });
  it("a displayed route puts its own starting materials there, de-duplicated, with the stock check as reported", () => {
    const result = {
      recommended_route_id: 2,
      ranked_routes: [route(1, [{ smiles: "CCO", in_stock: true }]), route(2, [{ smiles: "CC(=O)O", in_stock: true }, { smiles: "Oc1ccccc1C(=O)O", in_stock: false }, { smiles: "CC(=O)O", in_stock: true }])],
    } as unknown as RunResult;
    const p = projectionsOf(result);
    assert.equal(p.kind, "route");
    assert.deepEqual(p.items.map((i) => [i.smiles, i.note]), [["CC(=O)O", "in stock"], ["Oc1ccccc1C(=O)O", "not in stock"]]);
    assert.ok(p.items.every((i) => i.role === "STARTING MATERIAL"));
  });
  it("without a route the research analogues stand there, labelled with their reported similarity; errors show nothing", () => {
    const withHits = { ranked_routes: [], profile: { analogues: { library: "ChEMBL", hits: [{ molecule_id: 1, smiles: "CCN", tanimoto: 0.8123 }] } } } as unknown as RunResult;
    const a = projectionsOf(withHits);
    assert.equal(a.kind, "analogue");
    assert.equal(a.items[0].note, "Tanimoto 0.812");
    const errored = { ranked_routes: [], profile: { analogues: { error: "search failed" } } } as unknown as RunResult;
    assert.equal(projectionsOf(errored).kind, "none");
  });
  it("shows at most four", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ smiles: `C${"C".repeat(i)}`, in_stock: true }));
    const result = { recommended_route_id: 1, ranked_routes: [route(1, many)] } as unknown as RunResult;
    assert.equal(projectionsOf(result).items.length, 4);
  });
});
