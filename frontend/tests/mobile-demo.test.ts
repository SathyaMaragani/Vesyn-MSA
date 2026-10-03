import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compareDemo } from "../src/lib/mobile/demo.ts";
import { readInvestigations, saveInvestigation } from "../src/lib/mobile/cache.ts";
import type { DemoSnapshot } from "../src/lib/store/NeoProvider";

const before = JSON.parse(readFileSync(new URL("../public/demo/before.json", import.meta.url), "utf8")) as DemoSnapshot;
const after = JSON.parse(readFileSync(new URL("../public/demo/run.json", import.meta.url), "utf8")) as DemoSnapshot;

describe("recorded memory demonstration", () => {
  it("shows the verified score change and three unique simulated experiences", () => {
    assert.deepEqual(compareDemo(before.run.result!, after.run.result!), {
      previous: 0.7946, changed: 0.4946, recommended: 0.7791, steps: 2, experiences: 3,
    });
    assert.equal(before.run.result!.ranked_routes.length, 5);
    assert.equal(after.run.result!.ranked_routes.length, 5);
  });
  it("matches chemistry even when the engine renumbers every route", () => {
    const renumbered = structuredClone(after.run.result!);
    for (const route of renumbered.ranked_routes) route.route_id += 100;
    renumbered.recommended_route_id! += 100;
    assert.deepEqual(compareDemo(before.run.result!, renumbered), compareDemo(before.run.result!, after.run.result!));
  });
  it("never invents a comparison when the previous chemistry is absent", () => {
    assert.equal(compareDemo(before.run.result!, { ...after.run.result!, ranked_routes: [] }), null);
  });
});

describe("offline investigations", () => {
  it("keeps both sessions, replaces a revised result, and survives corrupt or blocked storage", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    let value: string | null = null;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: () => value, setItem: (_key: string, data: string) => { value = data; },
    } });
    try {
      saveInvestigation(before);
      saveInvestigation(after);
      assert.deepEqual(readInvestigations().map((d) => d.run.id), [after.run.id, before.run.id]);
      saveInvestigation({ ...after, run: { ...after.run, error: "updated" } });
      assert.equal(readInvestigations().length, 2);
      assert.equal(readInvestigations()[0].run.error, "updated");
      value = "{broken";
      assert.deepEqual(readInvestigations(), []);
      value = JSON.stringify([null, {}, { ...after, project: before.project }]);
      assert.deepEqual(readInvestigations(), []);
      Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
      assert.doesNotThrow(() => saveInvestigation(after));
      assert.deepEqual(readInvestigations(), []);
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
