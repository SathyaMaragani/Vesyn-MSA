import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDecisions, degradedSignals } from "../src/lib/events/decisions.ts";
import { foldAll } from "../src/lib/events/fold.ts";
import { flattenSteps, leafMolecules } from "../src/lib/events/routeSteps.ts";
import type { RouteNode } from "../src/types/routes.ts";
import { ev, sampleRun } from "./fixtures.ts";

const LIMITS = ["ReactionT5 is a learned model; agreement is supporting evidence, not proof.", "Nothing here has been run in a lab."];

describe("buildDecisions", () => {
  it("turns the replan into trigger / action from the event's own payload", () => {
    const d = buildDecisions(foldAll("run_a", sampleRun()), LIMITS).find((x) => x.title === "Search widened");
    assert.ok(d);
    assert.match(d.trigger, /flagged by validation/);
    assert.match(d.action, /100 iterations, top 5 → 250 iterations, top 10/);
    assert.equal(d.evidence, null); // nothing in the event: stays "not reported", not invented
  });

  it("marks a REVIEW_REQUIRED validation as a flagged decision", () => {
    const d = buildDecisions(foldAll("run_a", sampleRun()), LIMITS).filter((x) => x.title.startsWith("Route 0:"));
    assert.equal(d[0].tone, "bad");
    assert.match(d[0].action, /flagged for review/);
    assert.equal(d[1].tone, "ok");
  });

  it("uncertainty comes only from the backend's own limitation text", () => {
    const done = buildDecisions(foldAll("run_a", sampleRun()), LIMITS).at(-1);
    assert.equal(done?.uncertainty, "Nothing here has been run in a lab.");
    const noLimits = buildDecisions(foldAll("run_a", sampleRun()), null).at(-1);
    assert.equal(noLimits?.uncertainty, null);
  });

  it("summarises validation signals per tool, including an unavailable one", () => {
    const run = foldAll("run_a", [
      ev("VALIDATION_COMPLETED", 1, {
        route_id: 0,
        attempt: 1,
        assessment: "INSUFFICIENT_EVIDENCE",
        label: "Insufficient evidence",
        signals: { "rdkit.template_validation": { MATCH: 2 }, "reactiont5.forward_validation": { error: "connection refused" } },
      }),
    ]);
    const d = buildDecisions(run, LIMITS)[0];
    assert.match(d.evidence ?? "", /rdkit\.template_validation: MATCH 2/);
    assert.match(d.evidence ?? "", /reactiont5\.forward_validation: unavailable \(connection refused\)/);
    assert.match(d.uncertainty ?? "", /ReactionT5/);
  });
});

describe("degradedSignals", () => {
  it("lists failed and denied tool calls, not completed ones", () => {
    const run = foldAll("run_a", [
      ev("TOOL_REQUESTED", 1, { call_id: "a", tool: "llm.generate", reason: "r", input: {} }, { agent: "critic" }),
      ev("TOOL_FAILED", 2, { call_id: "a", tool: "llm.generate", status: "FAILED", error: "ollama unreachable" }, { agent: "critic" }),
      ev("TOOL_COMPLETED", 3, { call_id: "b", tool: "rdkit.represent", version: "v", duration_ms: 1, summary: {} }, { agent: "research" }),
    ]);
    assert.deepEqual(degradedSignals(run).map((c) => c.tool), ["llm.generate"]);
  });
});

describe("flattenSteps", () => {
  const leaf = (s: string): RouteNode => ({ molecule_smiles: s, is_stock_available: true, reactions: [] });
  const rxn = (reactants: RouteNode[], smiles: string) => ({
    reactants,
    reaction_smiles: smiles,
    template_used: null,
    template_hash: null,
    template_smarts: null,
    template_occurrence: null,
    score: null,
    classification: null,
  });
  const tree: RouteNode = {
    molecule_smiles: "T",
    is_stock_available: false,
    reactions: [rxn([{ molecule_smiles: "I", is_stock_available: false, reactions: [rxn([leaf("A"), leaf("B")], "A.B>>I")] }, leaf("C")], "I.C>>T")],
  };

  it("numbers steps pre-order from 1, like the backend's iter_steps", () => {
    const steps = flattenSteps(tree);
    assert.deepEqual(steps.map((s) => [s.index, s.product, s.depth]), [[1, "T", 0], [2, "I", 1]]);
  });
  it("finds starting materials with their stock flag", () => {
    assert.deepEqual(leafMolecules(tree).map((l) => l.smiles), ["A", "B", "C"]);
  });
});

import { COL, MOL_W, layoutRoute } from "../src/lib/events/routeGraph.ts";

describe("layoutRoute", () => {
  const leaf = (s: string): RouteNode => ({ molecule_smiles: s, is_stock_available: true, reactions: [] });
  const rx = (reactants: RouteNode[], smiles: string) => ({
    reactants, reaction_smiles: smiles, template_used: null, template_hash: null, template_smarts: null, template_occurrence: null, score: null, classification: null,
  });
  const two: RouteNode = {
    molecule_smiles: "T",
    is_stock_available: false,
    reactions: [rx([{ molecule_smiles: "I", is_stock_available: false, reactions: [rx([leaf("A"), leaf("B")], "A.B>>I")] }, leaf("C")], "I.C>>T")],
  };

  it("draws every molecule and reaction once, joined by edges", () => {
    const g = layoutRoute(two);
    assert.equal(g.mols.length, 5); // T, I, A, B, C
    assert.equal(g.rxns.length, 2);
    assert.equal(g.edges.length, 6);
  });

  it("numbers steps like the backend (pre-order): step 1 is the last step, step 2 the one before", () => {
    const g = layoutRoute(two);
    assert.deepEqual(g.rxns.map((r) => [r.step, r.reaction.reaction_smiles]), [[1, "I.C>>T"], [2, "A.B>>I"]]);
    assert.deepEqual(g.rxns.map((r) => r.step), flattenSteps(two).map((s) => s.index));
  });

  it("puts the target on the left and each generation one column to the right", () => {
    const g = layoutRoute(two);
    assert.equal(g.mols[0].x, 0);
    assert.equal(g.mols.find((m) => m.smiles === "I")?.x, COL);
    assert.equal(g.mols.find((m) => m.smiles === "A")?.x, COL * 2);
    assert.ok(g.width >= COL * 2 + MOL_W);
  });

  it("never stacks two leaves on the same row", () => {
    const g = layoutRoute(two);
    const ys = g.mols.filter((m) => m.leaf).map((m) => m.y);
    assert.equal(new Set(ys).size, ys.length);
  });

  it("handles a single molecule with no reactions", () => {
    const g = layoutRoute(leaf("X"));
    assert.equal(g.mols.length, 1);
    assert.equal(g.rxns.length, 0);
  });
});
