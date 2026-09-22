import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { foldAll } from "../src/lib/events/fold.ts";
import { parseEvent } from "../src/lib/events/parse.ts";
import type { DemoSnapshot } from "../src/lib/store/NeoProvider.tsx";

// public/demo/run.json is what the UI shows, labelled SIMULATED, when the API is offline.
const demo = JSON.parse(readFileSync(new URL("../public/demo/run.json", import.meta.url), "utf8")) as DemoSnapshot;

describe("recorded demo run", () => {
  it("folds to the finished run the record describes", () => {
    const events = demo.events.map(parseEvent);
    assert.ok(events.length > 0 && events.every((e) => e !== null), "every recorded event parses");
    const run = foldAll(demo.run.id, events as NonNullable<(typeof events)[number]>[]);
    assert.equal(run.phase, demo.run.status === "COMPLETED" ? "completed" : "failed");
    assert.equal(demo.project.runs?.[0]?.id, demo.run.id);
    assert.ok(demo.run.result, "the final package is included");
  });

  it("has the detail of every audited tool call", () => {
    for (const a of demo.audit) assert.equal(demo.auditCalls[a.id]?.id, a.id);
  });
});
