// Centralised client for WS /ws/events (backend/api/routes_mas.py).
//
// Protocol: connect with ?run_id=<id>&after=<seq>; the server replays persisted
// events with seq > after, then tails live ones. Events may arrive slightly out
// of order and a reconnect may replay some we already have - the fold sorts and
// dedupes by seq, so this client only has to (a) never lose the tail and
// (b) report honestly whether it is connected.
import { parseEventJson } from "../events/parse.ts";
import type { NeoEvent } from "../../types/events.ts";
import type { SocketStatus } from "../../types/api.ts";

/**
 * On reconnect, resume this far BEFORE the highest seq we saw. seq is global
 * across runs, and concurrent agents can deliver a lower seq after a higher one;
 * resuming exactly at the max could skip a late event. Replays are deduped.
 */
export const RESUME_MARGIN = 200;

const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 15000;

export interface EventSocketOptions {
  /** e.g. ws://localhost:8436 */
  baseUrl: string;
  runId: string;
  onEvent: (event: NeoEvent) => void;
  onStatus: (status: SocketStatus) => void;
  /** Highest seq processed so far; read at every (re)connect. */
  getLastSeq: () => number;
  /** Called for frames that were not valid events. Never throws into the socket. */
  onRejected?: (reason: string, raw: string) => void;
  /** Test seam. */
  createSocket?: (url: string) => WebSocket;
}

export function resumeSeq(lastSeq: number): number {
  return Math.max(0, lastSeq - RESUME_MARGIN);
}

export function eventsUrl(baseUrl: string, runId: string, after: number): string {
  return `${baseUrl}/ws/events?run_id=${encodeURIComponent(runId)}&after=${after}`;
}

export class EventSocket {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closedByUs = false;
  private everOpened = false;
  private readonly opts: EventSocketOptions;

  constructor(opts: EventSocketOptions) {
    this.opts = opts;
  }

  open(): void {
    this.closedByUs = false;
    this.connect();
  }

  close(): void {
    this.closedByUs = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close();
      } catch {
        // already closed
      }
    }
    this.opts.onStatus("idle");
  }

  private connect(): void {
    this.opts.onStatus(this.everOpened ? "reconnecting" : "connecting");
    const url = eventsUrl(this.opts.baseUrl, this.opts.runId, resumeSeq(this.opts.getLastSeq()));
    let socket: WebSocket;
    try {
      socket = this.opts.createSocket ? this.opts.createSocket(url) : new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.everOpened = true;
      this.attempts = 0;
      this.opts.onStatus("live");
    };
    socket.onmessage = (msg: MessageEvent) => {
      const raw = typeof msg.data === "string" ? msg.data : "";
      const event = parseEventJson(raw);
      if (event) this.opts.onEvent(event);
      else this.opts.onRejected?.("not a valid NeoChems event", raw.slice(0, 200));
    };
    socket.onerror = () => {
      // onclose always follows; reconnect is handled there.
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!this.closedByUs) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closedByUs) return;
    this.opts.onStatus("reconnecting");
    const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempts);
    this.attempts += 1;
    this.timer = setTimeout(() => this.connect(), delay + Math.floor(Math.random() * 250));
  }
}
