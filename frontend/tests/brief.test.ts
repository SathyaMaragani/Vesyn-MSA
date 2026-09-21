import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBrief } from "../src/lib/events/brief.ts";
import { foldAll } from "../src/lib/events/fold.ts";
import { provenanceRows } from "../src/lib/events/provenance.ts";
import { ev, sampleRun } from "./fixtures.ts";

const item = (items: ReturnType<typeof buildBrief>, key: string) => items.find((i) => i.key === key)!;

describe("buildBrief", () => {
  it("before any run: every field is not reported (null), nothing is invented", () => {
    const b = buildBrief({ run: foldAll(null, []), result: null, goal: null, activeAgent: null });
    assert.ok(b.every((i) => i.value === null || i.key === "alternatives"), JSON.stringify(b.filter((i) => i.value !== null)));
  });

  it("reports validation status from the validator's verdicts, and flags review-required as bad", () => {
    const run = foldAll("run_a", sampleRun().slice(0, 14)); // route 0 REVIEW_REQUIRED
    const b = buildBrief({ run, result: null, goal: "Find a feasible synthesis route", activeAgent: "Validation Agent" });
    assert.match(item(b, "validation").value ?? "", /1 review required/);
    assert.equal(item(b, "validation").tone, "bad");
    assert.match(item(b, "objective").value ?? "", /Find a feasible synthesis route — target Aspirin/);
    assert.equal(item(b, "agent").value, "Validation Agent");
  });

  it("counts replans as alternatives, and states that no confidence score exists", () => {
    const b = buildBrief({ run: foldAll("run_a", sampleRun()), result: null, goal: null, activeAgent: null });
    assert.match(item(b, "alternatives").value ?? "", /1 replan/);
    assert.match(item(b, "uncertainty").value ?? "", /no probability or confidence score/);
    assert.match(item(b, "final").value ?? "", /Route 0/);
  });

  it("a failed run's key issue is the backend's own error, never a made-up cause", () => {
    const run = foldAll("run_a", [ev("PROJECT_FAILED", 1, { project_id: "p", error: "RuntimeError: AiZynthFinder is not loaded" })]);
    assert.match(item(buildBrief({ run, result: null, goal: null, activeAgent: null }), "issue").value ?? "", /AiZynthFinder is not loaded/);
  });
});

describe("provenanceRows", () => {
  it("a source that never ran is 'not_called', not silently omitted or implied", () => {
    const rows = provenanceRows(foldAll("run_a", sampleRun()));
    assert.equal(rows.find((r) => r.tool === "ord.evidence")?.status, "not_called");
    assert.equal(rows.find((r) => r.tool === "pubchem.resolve")?.status, "ok");
    assert.equal(rows.length, 9);
  });

  it("carries the agent, version and duration of what ran; failure and partial are distinguished", () => {
    const run = foldAll("run_a", [
      ev("TOOL_STARTED", 1, { call_id: "a", tool: "ord.evidence", version: "ord+uspto-lowe", station: "library", input: {} }, { agent: "validator" }),
      ev("TOOL_COMPLETED", 2, { call_id: "a", tool: "ord.evidence", version: "ord+uspto-lowe", duration_ms: 40, summary: {} }, { agent: "validator" }),
      ev("TOOL_REQUESTED", 3, { call_id: "b", tool: "ord.evidence", reason: "r", input: {} }, { agent: "validator" }),
      ev("TOOL_FAILED", 4, { call_id: "b", tool: "ord.evidence", status: "FAILED", error: "db down" }, { agent: "validator" }),
      ev("TOOL_REQUESTED", 5, { call_id: "c", tool: "llm.generate", reason: "r", input: {} }, { agent: "critic" }),
      ev("TOOL_FAILED", 6, { call_id: "c", tool: "llm.generate", status: "FAILED", error: "ollama unreachable" }, { agent: "critic" }),
    ]);
    const rows = provenanceRows(run);
    const ord = rows.find((r) => r.tool === "ord.evidence")!;
    assert.equal(ord.status, "partial");
    assert.deepEqual(ord.agents, ["validator"]);
    assert.deepEqual(ord.versions, ["ord+uspto-lowe"]);
    assert.equal(ord.totalMs, 40);
    assert.equal(rows.find((r) => r.tool === "llm.generate")?.status, "failed");
  });
});
