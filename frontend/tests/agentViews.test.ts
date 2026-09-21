import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentViews } from "../src/lib/events/agentViews.ts";
import { emptyRun, foldAll } from "../src/lib/events/fold.ts";
import type { AgentSnapshot } from "../src/types/agents.ts";
import { ev, sampleRun } from "./fixtures.ts";

const snap = (id: string, status: AgentSnapshot["status"]): AgentSnapshot => ({
  id,
  name: `Name ${id}`,
  role: `Role ${id}`,
  station: "library",
  status,
  run_id: null,
  current_task: null,
  current_tool: null,
  updated_at: null,
});

const byId = (views: ReturnType<typeof buildAgentViews>, id: string) => {
  const v = views.find((x) => x.id === id);
  assert.ok(v, id);
  return v;
};

describe("buildAgentViews", () => {
  it("shows all 7 known agents, UNKNOWN, when the API is offline", () => {
    const views = buildAgentViews({ roster: null, run: emptyRun(null), health: "offline" });
    assert.equal(views.length, 7);
    assert.ok(views.every((v) => v.activity === "unknown"));
  });

  it("offline beats stale roster data - we cannot know", () => {
    const views = buildAgentViews({ roster: [snap("retro", "WORKING")], run: emptyRun(null), health: "offline" });
    assert.equal(byId(views, "retro").activity, "unknown");
  });

  it("with no run selected, uses the live roster and its backend-supplied names", () => {
    const views = buildAgentViews({ roster: [snap("retro", "WORKING")], run: emptyRun(null), health: "online" });
    assert.equal(byId(views, "retro").activity, "working");
    assert.equal(byId(views, "retro").name, "Name retro");
    assert.equal(byId(views, "critic").activity, "unknown"); // not in roster: not invented
  });

  it("a selected run with no events yet is UNKNOWN, not the roster's (possibly other run's) state", () => {
    const views = buildAgentViews({ roster: [snap("retro", "WORKING")], run: emptyRun("run_a"), health: "online" });
    assert.equal(byId(views, "retro").activity, "unknown");
  });

  it("with events, agents follow the fold and untouched agents are IDLE", () => {
    const run = foldAll("run_a", sampleRun());
    const views = buildAgentViews({ roster: null, run, health: "online" });
    assert.equal(byId(views, "planner").activity, "completed");
    assert.equal(byId(views, "evaluator").activity, "idle");
  });

  it("reads a searching agent from its in-flight retrieval tool", () => {
    const run = foldAll("run_a", [
      ev("AGENT_STATUS_CHANGED", 1, { status: "WORKING", current_task: null, station: "chemistry_workstation" }, { agent: "retro" }),
      ev("TOOL_STARTED", 2, { call_id: "c", tool: "aizynthfinder.plan", version: "v", station: "chemistry_workstation", input: {} }, { agent: "retro" }),
    ]);
    const retro = byId(buildAgentViews({ roster: null, run, health: "online" }), "retro");
    assert.equal(retro.activity, "searching");
    assert.equal(retro.activeCalls[0].tool, "aizynthfinder.plan");
  });

  it("the replanner is 'replanning' while PLANNING", () => {
    const run = foldAll("run_a", [
      ev("AGENT_STATUS_CHANGED", 1, { status: "PLANNING", current_task: null, station: "command_desk" }, { agent: "replanner" }),
    ]);
    assert.equal(byId(buildAgentViews({ roster: null, run, health: "online" }), "replanner").activity, "replanning");
  });
});

describe("failure stays visible after the backend resets agents to IDLE", () => {
  const failedRun = () =>
    foldAll("run_a", [
      ev("TASK_CREATED", 1, { title: "Generate retrosynthetic routes", attempt: 1 }, { agent: "retro", task: "t1" }),
      ev("TASK_STARTED", 2, {}, { agent: "retro", task: "t1" }),
      ev("TASK_FAILED", 3, { error: "RuntimeError: AiZynthFinder is not loaded" }, { agent: "retro", task: "t1" }),
      ev("AGENT_STATUS_CHANGED", 4, { status: "FAILED", current_task: null, station: "chemistry_workstation" }, { agent: "retro" }),
      ev("PROJECT_FAILED", 5, { project_id: "p", error: "RuntimeError: AiZynthFinder is not loaded" }),
      ev("AGENT_STATUS_CHANGED", 6, { status: "IDLE", current_task: null, station: "chemistry_workstation" }, { agent: "retro" }),
    ]);

  it("the agent whose task failed stays flagged; the others do not", () => {
    const views = buildAgentViews({ roster: null, run: failedRun(), health: "online" });
    const retro = byId(views, "retro");
    assert.equal(retro.status, "IDLE"); // the backend's truth is unchanged
    assert.equal(retro.activity, "failed"); // but the office does not hide what happened
    assert.match(retro.currentTask?.error ?? "", /not loaded/);
    assert.equal(byId(views, "critic").activity, "idle");
  });

  it("does not flag agents in a run where nothing failed", () => {
    const views = buildAgentViews({ roster: null, run: foldAll("run_a", sampleRun()), health: "online" });
    assert.ok(views.every((v) => v.activity !== "failed"));
  });
});

describe("calls that never completed", () => {
  it("are 'in flight' only while the run is live; afterwards they are reported as unfinished", () => {
    const start = ev("TOOL_STARTED", 1, { call_id: "c1", tool: "chembl.similarity", version: "v", station: "library", input: {} }, { agent: "research" });
    const live = buildAgentViews({ roster: null, run: foldAll("run_a", [ev("RUN_STARTED", 0, { project_id: "p", query: "x", params: { top_n: 5, iteration_limit: 100 } }), start]), health: "online" });
    assert.equal(byId(live, "research").activeCalls.length, 1);
    assert.equal(byId(live, "research").unfinishedCalls.length, 0);

    const ended = buildAgentViews({ roster: null, run: foldAll("run_a", [start, ev("PROJECT_FAILED", 2, { project_id: "p", error: "boom" })]), health: "online" });
    assert.equal(byId(ended, "research").activeCalls.length, 0);
    assert.equal(byId(ended, "research").unfinishedCalls[0].tool, "chembl.similarity");
  });
});
