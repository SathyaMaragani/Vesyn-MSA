import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { foldAll } from "../src/lib/events/fold.ts";
import { keyEvidence, mainChain, routeCards, targetFacts, timeline, whyRoute } from "../src/lib/dashboard/overview.ts";
import type { RunResult } from "../src/types/runs.ts";
import { sampleRun } from "./fixtures.ts";

// Real pipeline output, recorded by scripts/record_demo_runs.py: the overview is checked against what the backend
// actually produces, not against a shape someone remembered.
const recorded = (name: string): RunResult =>
  JSON.parse(readFileSync(new URL(`../../demo/runs/${name}.json`, import.meta.url), "utf8")).result;

describe("overview: route cards (recorded gefitinib run)", () => {
  const result = recorded("gefitinib");
  const cards = routeCards(result, "Gefitinib");

  it("draws every ranked route, and marks only the evaluator's choice as recommended", () => {
    assert.equal(cards.length, result.ranked_routes.length);
    assert.deepEqual(cards.filter((c) => c.role === "recommended").map((c) => c.routeId), [result.recommended_route_id]);
  });

  it("draws the spine starting material first and the target last", () => {
    for (const c of cards) {
      assert.equal(c.chain[c.chain.length - 1].smiles, result.target.canonical_smiles);
      assert.equal(c.chain[c.chain.length - 1].caption, "Gefitinib");
      assert.equal(c.chain[0].caption, "Starting material");
      assert.equal(typeof c.chain[0].inStock, "boolean", "a starting material says whether it is in stock");
      assert.ok(c.chain.length - 1 <= c.steps, "the spine never has more steps than the route");
    }
  });

  it("shows the ranking score, never a probability dressed up as confidence", () => {
    for (const c of cards) assert.equal(c.score, result.ranked_routes.find((r) => r.route_id === c.routeId)!.score);
  });

  it("flags a route a recalled lesson marked, and says when that lesson was simulated", () => {
    const marked = structuredClone(result);
    marked.ranked_routes[0].critique.issues.push({ step: 1, severity: "high", source: "memory", simulated: true, issue: "flagged earlier" });
    const card = routeCards(marked, null)[0];
    assert.equal(card.memoryFlagged, true);
    assert.deepEqual(card.checks.at(-1), { tone: "bad", text: "Reuses a transformation flagged in an earlier investigation", simulated: true });
  });

  it("follows the deepest precursor down the tree", () => {
    const leaf = (s: string) => ({ molecule_smiles: s, is_stock_available: true, reactions: [] });
    const rx = (reactants: object[]) => ({ reactants, reaction_smiles: "", template_used: null, template_hash: null, template_smarts: null, template_occurrence: null, score: null, classification: null });
    const tree = { molecule_smiles: "T", is_stock_available: false, reactions: [rx([leaf("CC"), { molecule_smiles: "I", is_stock_available: false, reactions: [rx([leaf("S")])] }])] };
    assert.deepEqual(mainChain(tree as never).map((n) => n.molecule_smiles), ["S", "I", "T"]);
  });
});

describe("overview: why this route", () => {
  it("explains the recommended route with each agent's own verdict", () => {
    const result = recorded("gefitinib");
    const why = whyRoute(result, routeCards(result, null));
    assert.ok(why);
    assert.equal(why.routeId, result.recommended_route_id);
    assert.ok(why.checks.length >= 5);
    assert.deepEqual(why.verdicts.map((v) => v.agent).slice(0, 6), ["Research", "Retrosynthesis", "Validation", "Critic", "Replanner", "Evaluator"]);
  });

  it("says no route was recommended when the evaluator refused, with its own reason (recorded erlotinib run)", () => {
    const result = recorded("erlotinib");
    assert.equal(result.recommended_route_id, null);
    const why = whyRoute(result, routeCards(result, null));
    assert.ok(why);
    assert.equal(why.routeId, null);
    assert.equal(why.reason, result.recommendation);
  });

  it("has nothing to explain for a request that was not a synthesis", () => {
    const result = { ...recorded("gefitinib"), task: "solubility" } as RunResult;
    assert.equal(whyRoute(result, []), null);
  });
});

describe("overview: target, evidence, timeline", () => {
  it("tags the target only with measured or looked-up facts", () => {
    const facts = targetFacts(recorded("gefitinib"));
    assert.equal(facts.formula, "C22H24ClFN4O3");
    assert.ok(facts.mw !== null && Math.abs(facts.mw - 446.9) < 0.1);
    assert.ok(facts.tags.some((t) => t.label.startsWith("logP")));
    assert.ok(facts.tags.every((t) => !/FDA|analgesic|anti-inflammatory/i.test(t.label)), "no therapeutic class the backend never produced");
  });

  it("starts the key evidence with the starting materials' stock", () => {
    const result = recorded("gefitinib");
    const items = keyEvidence(result.ranked_routes[0]);
    assert.equal(items[0].kind, "stock");
    assert.ok(items.length <= 4);
  });

  it("times each conclusion from the start of the run", () => {
    const items = timeline(foldAll("run_a", sampleRun()));
    assert.ok(items.length > 0);
    for (const it of items) assert.match(it.at, /^\d{2}:\d{2}$/);
    assert.equal(items.at(-1)?.who, "Evaluator");
  });
});
