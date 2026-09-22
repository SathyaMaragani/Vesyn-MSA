import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COVER_MS,
  HOLD_MS,
  NAV_TIMEOUT_MS,
  REVEAL_MS,
  classifyNavigation,
  destinationLabel,
  sectionOf,
  smoothStep,
  wheelPixels,
  wipeAt,
} from "../src/components/motion/motionLogic.ts";

const O = "http://localhost:3100";

describe("navigation classification", () => {
  it("sections", () => {
    assert.equal(sectionOf("/"), "");
    assert.equal(sectionOf("/lab/routes"), "lab");
  });
  it("moving inside the lab is a soft navigation (sheets over one world, no wipe)", () => {
    assert.equal(classifyNavigation("/lab", "/lab/chemistry", O).kind, "soft");
    assert.equal(classifyNavigation("/lab/routes", "/lab", O).kind, "soft");
  });
  it("crossing sections wipes", () => {
    assert.deepEqual(classifyNavigation("/", "/lab", O), { kind: "wipe", path: "/lab" });
    assert.equal(classifyNavigation("/lab", "/", O).kind, "wipe");
  });
  it("leaves alone everything the browser should handle itself", () => {
    assert.equal(classifyNavigation("/", "/lab", O, { meta: true }).kind, "none");
    assert.equal(classifyNavigation("/", "/lab", O, { button: 1 }).kind, "none");
    assert.equal(classifyNavigation("/", "/lab", O, { target: "_blank" }).kind, "none");
    assert.equal(classifyNavigation("/", "/lab", O, { download: true }).kind, "none");
    assert.equal(classifyNavigation("/", "/lab", O, { optOut: true }).kind, "none");
    assert.equal(classifyNavigation("/", "https://example.com/lab", O).kind, "none");
    assert.equal(classifyNavigation("/lab", "#top", O).kind, "none");
    assert.equal(classifyNavigation("/lab", "/lab?x=1", O).kind, "none");
  });
  it("labels the destination", () => {
    assert.equal(destinationLabel("/lab/routes"), "LABORATORY");
    assert.equal(destinationLabel("/"), "AIRLOCK");
  });
});

describe("wipe timeline", () => {
  it("starts clear, is monotonic while covering and is fully covered at the end of the cover", () => {
    assert.equal(wipeAt(0, null).cover, 0);
    let prev = -1;
    for (let t = 0; t <= COVER_MS; t += 20) {
      const c = wipeAt(t, null).cover;
      assert.ok(c >= prev);
      prev = c;
    }
    assert.equal(wipeAt(COVER_MS + 1, null).cover, 1);
  });
  it("holds fully covered until the destination reports in", () => {
    for (const t of [COVER_MS + 1, COVER_MS + 500, COVER_MS + 2000]) {
      const w = wipeAt(t, null);
      assert.equal(w.phase, "hold");
      assert.equal(w.cover, 1);
    }
  });
  it("reveals after the destination is ready, then goes idle", () => {
    const ready = COVER_MS + 300;
    assert.equal(wipeAt(ready + HOLD_MS - 1, ready).phase, "hold");
    const mid = wipeAt(ready + HOLD_MS + REVEAL_MS / 2, ready);
    assert.equal(mid.phase, "reveal");
    assert.ok(mid.cover > 0.4 && mid.cover < 0.6);
    assert.equal(wipeAt(ready + HOLD_MS + REVEAL_MS + 1, ready).phase, "idle");
  });
  it("a destination that is ready before the cover ends still waits for the cover", () => {
    assert.equal(wipeAt(COVER_MS - 10, 100).phase, "cover");
    assert.equal(wipeAt(COVER_MS + HOLD_MS - 1, 100).phase, "hold");
  });
  it("never traps the user behind the wipe: it reveals on its own after the timeout", () => {
    const t = COVER_MS + NAV_TIMEOUT_MS + HOLD_MS + REVEAL_MS + 5;
    assert.equal(wipeAt(t, null).phase, "idle");
  });
});

describe("smooth scroll maths", () => {
  it("normalises wheel deltas", () => {
    assert.equal(wheelPixels(100, 0, 800), 100);
    assert.equal(wheelPixels(3, 1, 800), 96);
    assert.equal(wheelPixels(1, 2, 800), 800);
  });
  it("eases toward the target and is frame-rate independent", () => {
    const a = smoothStep(0, 100, 1 / 60);
    assert.ok(a > 0 && a < 100);
    let x60 = 0;
    for (let i = 0; i < 60; i++) x60 = smoothStep(x60, 100, 1 / 60);
    let x144 = 0;
    for (let i = 0; i < 144; i++) x144 = smoothStep(x144, 100, 1 / 144);
    assert.ok(Math.abs(x60 - x144) < 0.01);
    assert.ok(smoothStep(0, 100, 10) > 99.9);
  });
});
