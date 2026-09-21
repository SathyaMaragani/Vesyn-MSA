import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeAtom } from "../src/lib/chem/analysis.ts";
import { parseSmiles } from "../src/lib/chem/smiles.ts";
import type { LoaderStep } from "../src/components/hero/loaderLogic.ts";
import { MAX_WAIT_MS, MIN_SHOW_MS, initialSteps, loaderVerdict, percentDone, registryStep, settleTimedOut } from "../src/components/hero/loaderLogic.ts";

const answered = (): LoaderStep[] => initialSteps().map((s) => ({ ...s, state: "ok" as const, detail: "READY" }));

describe("loader: never claims a result it did not get", () => {
  it("starts with every check pending at 0%", () => {
    const s = initialSteps();
    assert.ok(s.every((x) => x.state === "pending" && x.detail === ""));
    assert.equal(percentDone(s), 0);
  });
  it("percent is the share of checks that have answered (ok OR failed)", () => {
    const s = initialSteps();
    s[0] = { ...s[0], state: "ok", detail: "READY" };
    s[2] = { ...s[2], state: "failed", detail: "OFFLINE" };
    assert.equal(percentDone(s), 50);
    assert.equal(percentDone(answered()), 100);
  });
  it("lifts only when everything answered AND it has been readable for a moment", () => {
    assert.equal(loaderVerdict(answered(), MIN_SHOW_MS - 1).done, false);
    assert.deepEqual(loaderVerdict(answered(), MIN_SHOW_MS), { done: true, timedOut: false });
  });
  it("does not lift early with a check still pending", () => {
    const s = answered();
    s[3] = { ...s[3], state: "pending", detail: "" };
    assert.equal(loaderVerdict(s, MIN_SHOW_MS + 500).done, false);
  });
  it("a check that never answers is reported as NO RESPONSE after the wait limit, never hidden", () => {
    const s = answered();
    s[3] = { ...s[3], state: "pending", detail: "" };
    assert.deepEqual(loaderVerdict(s, MAX_WAIT_MS), { done: true, timedOut: true });
    const settled = settleTimedOut(s);
    assert.equal(settled[3].state, "failed");
    assert.equal(settled[3].detail, "NO RESPONSE");
    assert.equal(settled[0].detail, "READY"); // answered checks are untouched
  });
  it("registry line reflects what the API returned", () => {
    assert.deepEqual(registryStep({ ok: false }), { state: "failed", detail: "API OFFLINE" });
    assert.deepEqual(registryStep({ ok: true, ids: [] }), { state: "ok", detail: "NONE REPORTED" });
    assert.deepEqual(registryStep({ ok: true, ids: ["a", "b", "c"] }), { state: "ok", detail: "3 REGISTERED" });
  });
});

describe("atom hover readout comes from the parsed graph", () => {
  const g = parseSmiles("Cn1cnc2c1c(=O)n(C)c(=O)n2C");
  it("describes a carbonyl oxygen, a ring nitrogen and a methyl", () => {
    const o = g.atoms.find((a) => a.element === "O")!;
    const od = describeAtom(g, o.index)!;
    assert.equal(od.title, `O ${o.index + 1}`);
    assert.match(od.detail, /1 BOND · 0H · DOUBLE BOND/);
    const n = g.atoms.find((a) => a.element === "N" && a.aromatic)!;
    assert.match(describeAtom(g, n.index)!.detail, /AROMATIC/);
    const me = g.atoms[0];
    assert.match(describeAtom(g, me.index)!.detail, /1 BOND · 3H/);
  });
  it("returns null for an atom that does not exist", () => {
    assert.equal(describeAtom(g, 99), null);
  });
});
