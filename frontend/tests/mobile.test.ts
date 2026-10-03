// The assistant's pure parts, against the recorded run - the same data the app shows when the API is
// offline. What is checked here is what would silently go wrong: a reply that names the wrong route, a
// line routed to the wrong endpoint, a memory counted twice across sessions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildDashboard } from "../src/lib/dashboard/model.ts";
import { routeCards, whyRoute } from "../src/lib/dashboard/overview.ts";
import { foldAll } from "../src/lib/events/fold.ts";
import { parseEvent } from "../src/lib/events/parse.ts";
import { classifyAsk, conciseReply, dayLabel, agentFor, mergeSeen } from "../src/lib/mobile/assistant.ts";
import type { NeoEvent } from "../src/types/events.ts";
import type { DemoSnapshot } from "../src/lib/store/NeoProvider.tsx";

const demo = JSON.parse(readFileSync(new URL("../public/demo/run.json", import.meta.url), "utf8")) as DemoSnapshot;

function model() {
  const events = demo.events.map(parseEvent).filter((e): e is NeoEvent => e !== null);
  const run = foldAll(demo.run.id, events);
  return buildDashboard({ run, result: demo.run.result, agents: [], project: demo.project, services: [] });
}

describe("the short answer", () => {
  it("names the recommended route by its step count, and the reasons come from the run", () => {
    const m = model();
    const cards = routeCards(demo.run.result, m.target.name);
    const reply = conciseReply(demo.run.result, cards, whyRoute(demo.run.result, cards));
    const recommended = cards.find((c) => c.role === "recommended");

    assert.ok(reply && recommended, "the recorded run has a recommendation to report");
    assert.equal(reply.headline, `${cards.length} routes found. I recommend the ${recommended.steps}-step route.`);
    // no route letters or numbers: AiZynthFinder renumbers routes per run
    assert.doesNotMatch(reply.headline, /route [A-Z0-9]\b/);
    assert.ok(reply.bullets.length > 0 && reply.bullets.length <= 4);
    const checks = whyRoute(demo.run.result, cards)?.checks.map((c) => c.text) ?? [];
    for (const b of reply.bullets) assert.ok(checks.includes(b.text), `"${b.text}" is one of the run's own checks`);
  });

  it("uses the backend's own sentence when there is no route to name", () => {
    const refused = { ...demo.run.result!, recommended_route_id: null, limitations: ["No route passed validation."] };
    const reply = conciseReply(refused, [], null);
    assert.equal(reply?.headline, refused.recommendation);
  });

  it("is null before a run has produced anything", () => {
    assert.equal(conciseReply(null, [], null), null);
  });
});

describe("what a typed line means", () => {
  it("launches a run when there is nothing on screen to ask about", () => {
    assert.equal(classifyAsk("Why was this route rejected?", false), "investigate");
  });

  it("reads a question about the open run as a follow-up", () => {
    for (const q of ["Why was this route rejected?", "What did we learn about this reaction?", "Explain the score", "Show me why", "Explain the limitations of this profile.", "Continue my research", "Find an alternative route"]) {
      assert.equal(classifyAsk(q, true), "follow-up", q);
    }
  });

  it("still starts a new investigation when one is asked for", () => {
    for (const q of ["Find a synthesis route for erlotinib", "Plan a synthesis of aspirin", "Profile paracetamol"]) {
      assert.equal(classifyAsk(q, true), "investigate", q);
    }
  });

  // Regression: "Explain the limitations of this profile." was launched as a new investigation,
  // because "profile" reads as a task to run. It resolved the word "this" as a molecule and the run
  // failed with ResolutionError. A noun that names part of the run on screen is a reference to it.
  it("reads a question about part of the open run as a follow-up, not a new task", () => {
    for (const q of [
      "Explain the limitations of this profile.",
      "What did we learn about this reaction?",
      "Summarise this investigation",
      "Why was that step flagged?",
    ]) {
      assert.equal(classifyAsk(q, true), "follow-up", q);
    }
  });

  it("still launches when a question names its own molecule", () => {
    for (const q of ["What is the solubility of caffeine?", "Profile paracetamol", "Properties of ibuprofen"]) {
      assert.equal(classifyAsk(q, true), "investigate", q);
    }
  });

  it("puts a question to the agent whose role covers it", () => {
    assert.equal(agentFor("what did we learn last time?"), "critic");
    assert.equal(agentFor("what is its solubility?"), "research");
    assert.equal(agentFor("is there literature precedent?"), "validator");
    assert.equal(agentFor("why this one?"), "evaluator");
  });
});

describe("the memories this device has seen", () => {
  it("collects a run's recall, keeps the routes a memory ranked down, and does not double count", () => {
    const m = model();
    const once = mergeSeen([], m.memory, demo.project.name);
    const twice = mergeSeen(once, m.memory, demo.project.name);

    assert.equal(once.length, m.memory.items.length);
    assert.equal(twice.length, once.length, "the same run seen again adds nothing");
    assert.equal(
      once.filter((x) => x.rankedDown.length > 0).length > 0,
      (m.memory.applied?.length ?? 0) > 0,
      "a memory that changed the ranking is marked as one",
    );
    for (const mem of once) assert.ok(!mem.rankedDown.some((r, i) => mem.rankedDown.indexOf(r) !== i), "no repeated route ids");
  });

  it("marks a seeded demo record as simulated, never as measured", () => {
    const m = model();
    const seen = mergeSeen([], m.memory, null);
    for (const mem of seen) {
      const item = m.memory.items.find((i) => i.id === mem.id);
      assert.equal(mem.simulated, item?.simulated, "the simulated mark comes from the backend's own tag");
    }
  });
});

describe("day labels", () => {
  // the label is in the reader's own day, so the fixtures are local instants, not UTC ones
  const at = (days: number) => new Date(2026, 9, 3 - days, 12, 0, 0).toISOString();
  const now = new Date(2026, 9, 3, 18, 0, 0);
  it("names the recent days and dates the rest", () => {
    assert.equal(dayLabel(at(0), now), "Today");
    assert.equal(dayLabel(at(1), now), "Yesterday");
    assert.equal(dayLabel(at(3), now), "3 days ago");
    assert.notEqual(dayLabel(at(60), now), "Today");
    assert.equal(dayLabel("not a date", now), "Earlier");
  });

  it("calls a run started later today Today, whatever the clock says", () => {
    assert.equal(dayLabel(new Date(2026, 9, 3, 23, 30).toISOString(), now), "Today");
  });
});
