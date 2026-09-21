import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveActivity } from "../src/lib/events/activity.ts";
import { describeEvent } from "../src/lib/events/describe.ts";
import { applyEvents, emptyRun, foldAll } from "../src/lib/events/fold.ts";
import { parseEvent, parseEventJson, rejectionReason } from "../src/lib/events/parse.ts";
import { EVENT_TYPES } from "../src/types/events.ts";
import { ev, sampleRun } from "./fixtures.ts";

describe("parseEvent", () => {
  const good = { seq: 3, id: "ev_1", type: "TASK_STARTED", run_id: "r", agent_id: "retro", task_id: "t", ts: "x", data: {} };

  it("accepts a well-formed envelope", () => {
    assert.equal(parseEvent(good)?.type, "TASK_STARTED");
  });

  it("accepts null ids (RUN_STARTED has no agent)", () => {
    assert.ok(parseEvent({ ...good, agent_id: null, task_id: null }));
  });

  it("rejects malformed input instead of coercing it", () => {
    for (const bad of [null, 5, [], "x", { ...good, seq: "3" }, { ...good, type: "NOPE" }, { ...good, data: null }, { ...good, ts: 1 }]) {
      assert.equal(parseEvent(bad), null, JSON.stringify(bad));
    }
    assert.match(rejectionReason({ ...good, type: "NOPE" }) ?? "", /unknown event type/);
  });

  it("returns null for invalid JSON", () => {
    assert.equal(parseEventJson("{not json"), null);
  });

  it("knows exactly the 21 backend event types", () => {
    assert.equal(EVENT_TYPES.length, 21);
  });
});

describe("fold", () => {
  it("builds agents, tasks, tool calls, routes and outcome from events alone", () => {
    const s = foldAll("run_a", sampleRun());
    assert.equal(s.phase, "completed");
    assert.equal(s.query, "aspirin");
    assert.deepEqual(s.params, { top_n: 5, iteration_limit: 100 });
    assert.equal(s.target?.canonical_smiles, "CC(=O)Oc1ccccc1C(=O)O");
    assert.equal(s.agents.planner.status, "COMPLETED");
    assert.equal(s.tasks.task_plan.status, "COMPLETED");
    assert.equal(s.calls.tc_1.status, "COMPLETED");
    assert.equal(s.calls.tc_1.durationMs, 120);
    assert.equal(s.messages.length, 1);
    assert.equal(s.outcome?.recommendedRouteId, 0);
    assert.equal(s.lastSeq, 20);
  });

  it("keys routes by attempt - route_id restarts at 0 every attempt", () => {
    const s = foldAll("run_a", sampleRun());
    assert.deepEqual(s.routeOrder, ["1:0", "2:0"]);
    assert.equal(s.routes["1:0"].validation?.assessment, "REVIEW_REQUIRED");
    assert.equal(s.routes["2:0"].validation?.assessment, "SUPPORTED");
  });

  it("attributes the critique to the latest attempt", () => {
    const s = foldAll("run_a", sampleRun());
    assert.equal(s.routes["2:0"].critique?.counts.medium, 1);
    assert.equal(s.routes["1:0"].critique, null);
  });

  it("records a replan with its budgets and completion", () => {
    const s = foldAll("run_a", sampleRun());
    assert.equal(s.replans.length, 1);
    assert.equal(s.replans[0].previous.iteration_limit, 100);
    assert.equal(s.replans[0].next.iteration_limit, 250);
    assert.equal(s.replans[0].completed, true);
    assert.equal(s.replanActive, false);
  });

  it("tracks in-flight tool calls per agent, several at once", () => {
    const events = [
      ev("TOOL_STARTED", 1, { call_id: "a", tool: "ord.evidence", version: "v", station: "library", input: {} }, { agent: "validator" }),
      ev("TOOL_STARTED", 2, { call_id: "b", tool: "ord.evidence", version: "v", station: "library", input: {} }, { agent: "validator" }),
      ev("TOOL_COMPLETED", 3, { call_id: "a", tool: "ord.evidence", version: "v", duration_ms: 5, summary: {} }, { agent: "validator" }),
    ];
    const s = foldAll("run_a", events);
    assert.deepEqual(s.agents.validator.activeCalls, ["b"]);
  });

  it("records a policy denial as DENIED, never as running", () => {
    const s = foldAll("run_a", [
      ev("TOOL_REQUESTED", 1, { call_id: "x", tool: "aizynthfinder.plan", reason: "r", input: {} }, { agent: "critic" }),
      ev("TOOL_FAILED", 2, { call_id: "x", tool: "aizynthfinder.plan", status: "DENIED", error: "not permitted" }, { agent: "critic" }),
    ]);
    assert.equal(s.calls.x.status, "DENIED");
    assert.equal(s.calls.x.error, "not permitted");
    assert.deepEqual(s.agents.critic?.activeCalls ?? [], []);
  });

  it("marks the run failed with the backend's error", () => {
    const s = foldAll("run_a", [ev("PROJECT_FAILED", 1, { project_id: "p", error: "ResolutionError: nope" })]);
    assert.equal(s.phase, "failed");
    assert.equal(s.error, "ResolutionError: nope");
  });

  it("a refusal to recommend is an outcome, not an error", () => {
    const s = foldAll("run_a", [
      ev("PROJECT_COMPLETED", 1, { project_id: "p", recommended_route_id: null, recommendation: "No route can be recommended", routes: 2 }),
    ]);
    assert.equal(s.phase, "completed");
    assert.equal(s.outcome?.recommendedRouteId, null);
  });
});

describe("applyEvents", () => {
  it("converges: out-of-order and duplicated delivery equals the sorted fold", () => {
    const events = sampleRun();
    const expected = foldAll("run_a", events);

    const shuffled = events.slice().reverse();
    let s = emptyRun("run_a");
    s = applyEvents(s, shuffled.slice(0, 7));
    s = applyEvents(s, shuffled.slice(5)); // overlaps: duplicates
    s = applyEvents(s, events); // full redelivery
    assert.deepEqual(s, expected);
  });

  it("applies in-order batches incrementally and advances lastSeq", () => {
    const events = sampleRun();
    let s = emptyRun("run_a");
    s = applyEvents(s, events.slice(0, 10));
    assert.equal(s.lastSeq, 10);
    s = applyEvents(s, events.slice(10));
    assert.deepEqual(s, foldAll("run_a", events));
  });

  it("a late lower-seq event is folded in the right place", () => {
    const events = sampleRun();
    const late = events[5]; // seq 6
    const rest = events.filter((e) => e !== late);
    let s = applyEvents(emptyRun("run_a"), rest);
    s = applyEvents(s, [late]);
    assert.deepEqual(s, foldAll("run_a", events));
  });

  it("ignores events from another run", () => {
    const s0 = emptyRun("run_a");
    const s1 = applyEvents(s0, [ev("PROJECT_FAILED", 1, { project_id: "p", error: "x" }, { run: "run_b" })]);
    assert.equal(s1, s0);
  });

  it("does nothing while no run is selected", () => {
    const s0 = emptyRun(null);
    assert.equal(applyEvents(s0, sampleRun()), s0);
  });

  it("returns the same object for pure duplicates (no needless re-render)", () => {
    const s = applyEvents(emptyRun("run_a"), sampleRun());
    assert.equal(applyEvents(s, sampleRun().slice(0, 3)), s);
  });
});

describe("deriveActivity", () => {
  const base = { agentId: "retro", activeTools: [] as string[], replanActive: false };
  it("maps every backend status", () => {
    assert.equal(deriveActivity({ ...base, status: "IDLE" }), "idle");
    assert.equal(deriveActivity({ ...base, status: "VALIDATING" }), "validating");
    assert.equal(deriveActivity({ ...base, status: "CRITICIZING" }), "critiquing");
    assert.equal(deriveActivity({ ...base, status: "COMPLETED" }), "completed");
    assert.equal(deriveActivity({ ...base, status: "FAILED" }), "failed");
    assert.equal(deriveActivity({ ...base, status: "UNKNOWN" }), "unknown");
  });
  it("WORKING with a retrieval tool in flight reads as searching", () => {
    assert.equal(deriveActivity({ ...base, status: "WORKING", activeTools: ["aizynthfinder.plan"] }), "searching");
    assert.equal(deriveActivity({ ...base, status: "WORKING", activeTools: ["llm.generate"] }), "working");
    assert.equal(deriveActivity({ ...base, status: "WORKING" }), "working");
  });
  it("PLANNING is replanning for the replanner, thinking otherwise", () => {
    assert.equal(deriveActivity({ ...base, agentId: "replanner", status: "PLANNING" }), "replanning");
    assert.equal(deriveActivity({ ...base, agentId: "planner", status: "PLANNING" }), "thinking");
  });
});

describe("describeEvent", () => {
  it("describes every event type from its own payload", () => {
    for (const e of sampleRun()) {
      const line = describeEvent(e);
      assert.ok(line.text.length > 0 && line.tag.length > 0, e.type);
    }
  });
  it("shows the real widening for a replan", () => {
    const replan = sampleRun().find((e) => e.type === "REPLAN_STARTED");
    assert.ok(replan);
    assert.match(describeEvent(replan).text, /100 iterations, top 5 → 250 iterations, top 10/);
  });
});
