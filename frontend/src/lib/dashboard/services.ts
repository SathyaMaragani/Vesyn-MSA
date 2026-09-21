// System health for the dashboard, derived ONLY from what the backend answered.
//
// The backend has no single "status of everything" endpoint, so the dashboard asks the ones that exist:
//   GET /health                          the API process
//   GET /api/projects                    the database behind the agent store (via the provider's projects load)
//   GET /retrosynthesis/health           AiZynthFinder: 200 when loaded, 503 with the load error when not
//   GET /retrosynthesis/evidence/status  the reaction-evidence index
//   GET /molecules/stats                 the chemical library
// plus the WebSocket status from the provider. A service that answers with a failure is shown as
// failed with the backend's own words; one that cannot be reached is OFFLINE. Nothing is assumed.
import type { ApiHealth, ApiResult, LoadState, SocketStatus } from "../../types/api.ts";

export type ServiceState = "online" | "offline" | "error" | "warn" | "idle" | "checking";

export interface ServiceStatus {
  id: "api" | "stream" | "database" | "retro" | "evidence" | "library";
  label: string;
  state: ServiceState;
  /** The short word the panel shows: ONLINE, CONNECTED, OFFLINE, ... */
  word: string;
  /** A one-line qualifier (load time, indexed reactions, ...) or the failure reason. */
  detail: string | null;
  /** The endpoint this came from, for INSPECT. */
  source: string;
}

export interface RetroHealth {
  status?: string;
  model_loaded?: boolean;
  load_time_seconds?: number;
}
export interface EvidenceStatus {
  available?: boolean;
  provider_display_name?: string;
  indexed_reactions?: number;
}

export interface ServiceProbes {
  retro: ApiResult<RetroHealth> | null;
  evidence: ApiResult<EvidenceStatus> | null;
  library: ApiResult<unknown> | null;
}

// The API answered /health, so a dependent request that "cannot be reached" did not fail because the API is down: the
// server crashed on it (an unhandled 500 carries no CORS headers, so the browser reports a network failure and hides
// the status) or it was blocked. Say that, instead of "offline" or the browser's opaque "Failed to fetch".
const UNREADABLE = "the API is up, but this request failed before a status could be read (typically an unhandled server error)";
const failure = (r: ApiResult<unknown>): { state: ServiceState; word: string; detail: string } =>
  r.status === "offline" ? { state: "error", word: "UNAVAILABLE", detail: UNREADABLE } : r.status === "error" ? { state: "error", word: "ERROR", detail: r.message } : { state: "error", word: "ERROR", detail: "unexpected answer" };

export function serviceStatuses(input: {
  health: ApiHealth;
  socket: SocketStatus;
  runId: string | null;
  projects: LoadState<unknown>;
  apiBase: string;
  probes: ServiceProbes;
}): ServiceStatus[] {
  const { health, socket, runId, projects, apiBase, probes } = input;
  const out: ServiceStatus[] = [];

  out.push(
    health === "checking"
      ? { id: "api", label: "API", state: "checking", word: "CHECKING", detail: null, source: "GET /health" }
      : health === "online"
        ? { id: "api", label: "API", state: "online", word: "ONLINE", detail: apiBase, source: "GET /health" }
        : { id: "api", label: "API", state: "offline", word: "OFFLINE", detail: `no answer from ${apiBase}`, source: "GET /health" },
  );

  const stream: Omit<ServiceStatus, "id" | "label" | "source"> =
    health === "offline"
      ? { state: "offline", word: "OFFLINE", detail: "the API is unreachable" }
      : !runId
        ? { state: "idle", word: "IDLE", detail: "no run selected" }
        : socket === "live"
          ? { state: "online", word: "CONNECTED", detail: null }
          : socket === "reconnecting"
            ? { state: "warn", word: "RECONNECTING", detail: "the socket dropped; history is re-synced from the API" }
            : { state: "checking", word: "CONNECTING", detail: null };
  out.push({ id: "stream", label: "Event stream", source: "WS /ws/events", ...stream });

  const db: Omit<ServiceStatus, "id" | "label" | "source"> =
    health === "offline"
      ? { state: "offline", word: "OFFLINE", detail: "the API is unreachable" }
      : projects.state === "ok" || projects.state === "empty"
        ? { state: "online", word: "ONLINE", detail: projects.state === "ok" ? "agent store answering" : "agent store answering, no projects yet" }
        : projects.state === "error"
          ? { state: "error", word: "ERROR", detail: projects.message }
          : projects.state === "offline"
            ? { state: "offline", word: "OFFLINE", detail: "the API is unreachable" }
            : { state: "checking", word: "CHECKING", detail: null };
  out.push({ id: "database", label: "Database", source: "GET /api/projects", ...db });

  const r = probes.retro;
  let retro: Omit<ServiceStatus, "id" | "label" | "source">;
  if (health === "offline") retro = { state: "offline", word: "OFFLINE", detail: "the API is unreachable" };
  else if (!r) retro = { state: "checking", word: "CHECKING", detail: null };
  else if (r.status === "ok") {
    retro = r.data.model_loaded
      ? { state: "online", word: "ONLINE", detail: r.data.load_time_seconds !== undefined ? `model loaded in ${r.data.load_time_seconds} s` : "model loaded" }
      : { state: "offline", word: "OFFLINE", detail: "the service is up but reports the model is not loaded" };
  } else {
    const f = failure(r);
    // the backend answers 503 with the reason the model did not load: that is what the user needs to read
    retro = r.status === "offline" ? { state: "offline", word: "OFFLINE", detail: f.detail } : { state: "offline", word: "OFFLINE", detail: f.detail };
  }
  out.push({ id: "retro", label: "AiZynthFinder", source: "GET /retrosynthesis/health", ...retro });

  const e = probes.evidence;
  let ev: Omit<ServiceStatus, "id" | "label" | "source">;
  if (health === "offline") ev = { state: "offline", word: "OFFLINE", detail: "the API is unreachable" };
  else if (!e) ev = { state: "checking", word: "CHECKING", detail: null };
  else if (e.status === "ok") {
    ev = e.data.available
      ? { state: "online", word: "ONLINE", detail: e.data.indexed_reactions !== undefined ? `${e.data.indexed_reactions.toLocaleString("en-US")} indexed reactions` : (e.data.provider_display_name ?? null) }
      : { state: "warn", word: "NOT CONFIGURED", detail: e.data.provider_display_name ?? "no evidence source configured" };
  } else ev = failure(e);
  out.push({ id: "evidence", label: "Evidence index", source: "GET /retrosynthesis/evidence/status", ...ev });

  const l = probes.library;
  let lib: Omit<ServiceStatus, "id" | "label" | "source">;
  if (health === "offline") lib = { state: "offline", word: "OFFLINE", detail: "the API is unreachable" };
  else if (!l) lib = { state: "checking", word: "CHECKING", detail: null };
  else if (l.status === "ok") lib = { state: "online", word: "ONLINE", detail: null };
  else lib = failure(l);
  out.push({ id: "library", label: "Chemical library", source: "GET /molecules/stats", ...lib });

  return out;
}

/** A service the user should be told about: anything that failed or is not available (not idle / checking / online). */
export const isProblem = (s: ServiceStatus): boolean => s.state === "offline" || s.state === "error" || s.state === "warn";
