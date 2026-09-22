import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventSocket, RESUME_MARGIN, eventsUrl, resumeSeq } from "../src/lib/ws/eventSocket.ts";
import type { NeoEvent } from "../src/types/events.ts";
import type { SocketStatus } from "../src/types/api.ts";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
}

const valid = (seq: number) =>
  JSON.stringify({ seq, id: `ev_${seq}`, type: "TASK_STARTED", run_id: "r", agent_id: "retro", task_id: "t", ts: "x", data: {} });

function harness(lastSeq: () => number) {
  FakeSocket.instances = [];
  const statuses: SocketStatus[] = [];
  const events: NeoEvent[] = [];
  const rejected: string[] = [];
  const socket = new EventSocket({
    baseUrl: "ws://api",
    runId: "r",
    getLastSeq: lastSeq,
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    onRejected: (why) => rejected.push(why),
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
  });
  return { socket, statuses, events, rejected };
}

describe("EventSocket", () => {
  it("builds the documented URL", () => {
    assert.equal(eventsUrl("ws://h:8436", "run_x", 0), "ws://h:8436/ws/events/run_x/0");
  });

  it("resumes a safe margin before the last seq, never below zero", () => {
    assert.equal(resumeSeq(0), 0);
    assert.equal(resumeSeq(50), 0);
    assert.equal(resumeSeq(1000), 1000 - RESUME_MARGIN);
  });

  it("reports connecting -> live and delivers valid events, rejecting junk", () => {
    const h = harness(() => 0);
    h.socket.open();
    const s = FakeSocket.instances[0];
    assert.deepEqual(h.statuses, ["connecting"]);
    s.onopen?.();
    s.onmessage?.({ data: valid(1) });
    s.onmessage?.({ data: "{oops" });
    s.onmessage?.({ data: JSON.stringify({ seq: 2, type: "MYSTERY" }) });
    assert.equal(h.statuses.at(-1), "live");
    assert.equal(h.events.length, 1);
    assert.equal(h.rejected.length, 2);
    h.socket.close();
  });

  it("reconnects after a drop and resumes from the last seq seen", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let last = 0;
    const h = harness(() => last);
    h.socket.open();
    const first = FakeSocket.instances[0];
    first.onopen?.();
    last = 900;
    first.onclose?.(); // server went away
    assert.equal(h.statuses.at(-1), "reconnecting");
    t.mock.timers.tick(2000);
    assert.equal(FakeSocket.instances.length, 2);
    assert.match(FakeSocket.instances[1].url, /\/r\/700$/);
    FakeSocket.instances[1].onopen?.();
    assert.equal(h.statuses.at(-1), "live");
    h.socket.close();
  });

  it("backs off exponentially while the API stays down", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const h = harness(() => 0);
    h.socket.open();
    FakeSocket.instances[0].onclose?.();
    t.mock.timers.tick(1300); // ~1s + jitter
    assert.equal(FakeSocket.instances.length, 2);
    FakeSocket.instances[1].onclose?.();
    t.mock.timers.tick(1300); // second wait is ~2s: not yet
    assert.equal(FakeSocket.instances.length, 2);
    t.mock.timers.tick(1200);
    assert.equal(FakeSocket.instances.length, 3);
    h.socket.close();
  });

  it("does not reconnect after close()", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const h = harness(() => 0);
    h.socket.open();
    const s = FakeSocket.instances[0];
    h.socket.close();
    s.onclose?.();
    t.mock.timers.tick(60000);
    assert.equal(FakeSocket.instances.length, 1);
    assert.equal(h.statuses.at(-1), "idle");
  });
});
