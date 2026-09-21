import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAgentViews } from "../src/lib/events/agentViews.ts";
import { activeAgentId, latestAlert } from "../src/lib/events/attention.ts";
import { foldAll } from "../src/lib/events/fold.ts";
import { routeBars } from "../src/lib/events/routeBars.ts";
import { ev, sampleRun } from "./fixtures.ts";

describe("routeBars", () => {
  it("shows only the latest attempt, coloured by the validator's verdict", () => {
    const bars = routeBars(foldAll("run_a", sampleRun()));
    assert.equal(bars.length, 1);
    assert.equal(bars[0].steps, 2);
    assert.equal(bars[0].assessment, "SUPPORTED");
  });
  it("a route the validator has not judged has no assessment - not a guess", () => {
    const run = foldAll("run_a", [ev("ROUTE_GENERATED", 1, { route_id: 0, attempt: 1, steps: 3, state_score: 0.9 })]);
    assert.equal(routeBars(run)[0].assessment, null);
  });
});

describe("latestAlert", () => {
  it("is null before anything noteworthy happens", () => {
    assert.equal(latestAlert(foldAll("run_a", sampleRun().slice(0, 6))), null);
  });
  it("flags a REVIEW_REQUIRED validation and points at the validator", () => {
    const run = foldAll("run_a", sampleRun().slice(0, 14));
    const a = latestAlert(run);
    assert.equal(a?.title, "VALIDATION FLAGGED");
    assert.equal(a?.agentId, "validator");
  });
  it("surfaces the replan with the backend's own reason", () => {
    const a = latestAlert(foldAll("run_a", sampleRun().slice(0, 15)));
    assert.equal(a?.title, "REPLANNING");
    assert.match(a?.detail ?? "", /flagged by validation/);
  });
  it("completion is the latest alert; a refusal is a warning, not an error", () => {
    assert.equal(latestAlert(foldAll("run_a", sampleRun()))?.title, "RUN COMPLETED");
    const refused = foldAll("run_a", [
      ev("PROJECT_COMPLETED", 1, { project_id: "p", recommended_route_id: null, recommendation: "No route can be recommended", routes: 1 }),
    ]);
    assert.equal(latestAlert(refused)?.tone, "warn");
  });
});

describe("activeAgentId", () => {
  it("follows the earliest active agent in workflow order, null when idle", () => {
    const run = foldAll("run_a", [
      ev("AGENT_STATUS_CHANGED", 1, { status: "VALIDATING", current_task: null, station: "validation_station" }, { agent: "validator" }),
      ev("AGENT_STATUS_CHANGED", 2, { status: "WORKING", current_task: null, station: "chemistry_workstation" }, { agent: "retro" }),
    ]);
    const agents = buildAgentViews({ roster: null, run, health: "online" });
    assert.equal(activeAgentId(agents), "retro");
    assert.equal(activeAgentId(buildAgentViews({ roster: null, run: foldAll("run_a", sampleRun()), health: "online" })), null);
  });
});
