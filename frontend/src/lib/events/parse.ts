// Validates a raw WebSocket / REST payload into a NeoEvent. Anything that is not
// a well-formed envelope of a known type is rejected (returns null) rather than
// coerced: the UI must never act on a shape it was not built for.
import type { EventType, NeoEvent } from "../../types/events.ts";
import { EVENT_TYPES } from "../../types/events.ts";

const KNOWN: ReadonlySet<string> = new Set<string>(EVENT_TYPES);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && KNOWN.has(v);
}

/** Why an event was rejected, for diagnostics. null means it is valid. */
export function rejectionReason(raw: unknown): string | null {
  if (!isRecord(raw)) return "not an object";
  if (typeof raw.seq !== "number" || !Number.isFinite(raw.seq)) return "seq is not a number";
  if (typeof raw.id !== "string") return "id is not a string";
  if (!isEventType(raw.type)) return `unknown event type ${JSON.stringify(raw.type)}`;
  if (typeof raw.ts !== "string") return "ts is not a string";
  if (!isStringOrNull(raw.run_id ?? null)) return "run_id is not a string";
  if (!isStringOrNull(raw.agent_id ?? null)) return "agent_id is not a string";
  if (!isStringOrNull(raw.task_id ?? null)) return "task_id is not a string";
  if (!isRecord(raw.data)) return "data is not an object";
  return null;
}

export function parseEvent(raw: unknown): NeoEvent | null {
  if (rejectionReason(raw) !== null) return null;
  const r = raw as Record<string, unknown>;
  return {
    seq: r.seq,
    id: r.id,
    type: r.type,
    run_id: (r.run_id ?? null) as string | null,
    agent_id: (r.agent_id ?? null) as string | null,
    task_id: (r.task_id ?? null) as string | null,
    ts: r.ts,
    data: r.data,
  } as NeoEvent;
}

export function parseEventJson(text: string): NeoEvent | null {
  try {
    return parseEvent(JSON.parse(text));
  } catch {
    return null;
  }
}
