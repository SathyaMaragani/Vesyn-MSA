import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAB_OVERVIEW } from "../src/components/world/cameraPoses.ts";
import {
  CAMERA_KEYS,
  INIT_LINES,
  READY_THRESHOLD,
  cameraAt,
  corridorPower,
  doorOpen,
  initLinesShown,
  readyOpacity,
  stationPower,
  titleOpacity,
} from "../src/components/airlock/timeline.ts";

describe("airlock timeline", () => {
  it("starts dark and closed: title visible, nothing powered, doors shut", () => {
    assert.equal(titleOpacity(0), 1);
    assert.equal(corridorPower(0), 0);
    assert.equal(doorOpen(0), 0);
    assert.equal(initLinesShown(0), 0);
    assert.equal(readyOpacity(0), 0);
  });

  it("the doors are fully open before the camera reaches them, and stay open", () => {
    assert.equal(doorOpen(0.52), 1);
    assert.equal(doorOpen(1), 1);
    assert.ok(cameraAt(0.52).pos[2] > 22, "still in the corridor when the doors finish opening");
  });

  it("the camera passes through the door plane (z = 22) only once the doors are open", () => {
    let crossed = -1;
    for (let p = 0; p <= 1; p += 0.005) {
      if (cameraAt(p).pos[2] <= 22) {
        crossed = p;
        break;
      }
    }
    assert.ok(crossed > 0.52 && crossed < 0.8, `crossed at ${crossed}`);
    assert.equal(doorOpen(crossed), 1);
  });

  it("ends exactly on the lab's overview pose, so /lab continues from the last frame", () => {
    const end = cameraAt(1);
    assert.deepEqual(end.pos, [...LAB_OVERVIEW.pos]);
    assert.deepEqual(end.look, [...LAB_OVERVIEW.look]);
  });

  it("camera keys are strictly ordered", () => {
    for (let i = 1; i < CAMERA_KEYS.length; i++) assert.ok(CAMERA_KEYS[i].p > CAMERA_KEYS[i - 1].p);
  });

  it("all init lines have shown by the end of the init beat", () => {
    assert.equal(initLinesShown(0.34), INIT_LINES.length);
  });

  it("workstations power up one after another in workflow order", () => {
    const n = 7;
    const p = 0.75;
    const powers = Array.from({ length: n }, (_, i) => stationPower(p, i, n));
    for (let i = 1; i < n; i++) assert.ok(powers[i] <= powers[i - 1], `station ${i}`);
    assert.equal(stationPower(1, n - 1, n), 1, "all lit at the end");
    assert.equal(stationPower(0.5, 0, n), 0, "none lit before the lab is entered");
  });

  it("the enter control is available only once the ready state is reached", () => {
    assert.ok(readyOpacity(READY_THRESHOLD) > 0.7);
    assert.equal(readyOpacity(0.6), 0);
  });
});
