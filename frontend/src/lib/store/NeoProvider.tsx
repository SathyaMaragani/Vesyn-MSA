"use client";

// The single source of truth for the laptop app.
//
//   backend --REST--> roster / tools / graph / projects / run record
//   backend --WS----> EventSocket -> parseEvent -> (batched) -> fold -> RunView
//
// Views read from here; they never fetch or open sockets themselves.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { API_BASE, WS_BASE, createProject, getGraph, getHealth, getProject, getRun, listAgents, listEvents, listProjects, listTools } from "@/lib/api";
import { buildAgentViews, type AgentView } from "@/lib/events/agentViews";
import { applyEvents, emptyRun, foldAll, type RunView } from "@/lib/events/fold";
import { parseEvent } from "@/lib/events/parse";
import { EventSocket, resumeSeq } from "@/lib/ws/eventSocket";
import type { AgentSnapshot } from "@/types/agents";
import type { ApiHealth, ApiResult, LoadState, SocketStatus } from "@/types/api";
import type { GraphDescription, ToolInfo } from "@/types/audit";
import type { NeoEvent } from "@/types/events";
import type { Project, ProjectCreated, RunRecord } from "@/types/runs";

const HEALTH_POLL_ONLINE_MS = 5000;
const HEALTH_POLL_OFFLINE_MS = 2500;
const EVENT_BATCH_MS = 40;
const PROJECT_KEY = "vesyn.project";

/** The chosen project survives moving between the dashboard and the lab (separate pages, one provider each). */
const remember = (id: string) => {
  try {
    window.sessionStorage.setItem(PROJECT_KEY, id);
  } catch {
    /* storage unavailable: each page opens on the latest project */
  }
};
const recall = (): string | null => {
  try {
    return window.sessionStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
};
const RECONCILE_MS = 3000;

type RunAction = { type: "select"; runId: string | null } | { type: "events"; events: NeoEvent[] };

function runReducer(state: RunView, action: RunAction): RunView {
  switch (action.type) {
    case "select":
      return emptyRun(action.runId);
    case "events":
      return applyEvents(state, action.events);
  }
}

export interface NeoContextValue {
  apiBase: string;
  health: ApiHealth;
  socket: SocketStatus;
  roster: AgentSnapshot[] | null;
  tools: ToolInfo[] | null;
  graph: GraphDescription | null;
  projects: LoadState<Project[]>;
  projectId: string | null;
  runId: string | null;
  /** What the whole UI renders. While replaying this is the fold of the events up to `cursor`; otherwise it is the live run. */
  run: RunView;
  /** The live run, always up to date, regardless of any replay. */
  liveRun: RunView;
  /** null = live. A seq = the UI shows the run as it stood after that event. */
  cursor: number | null;
  setCursor: (seq: number | null) => void;
  /** The persisted run (status, error, final evidence package). */
  runRecord: LoadState<RunRecord>;
  agents: AgentView[];
  /** Frames the socket received that were not valid Vesyn events. */
  rejectedFrames: number;
  /** Start a run from a plain-words prompt and/or a drawn structure (which wins over any molecule the prompt names). */
  launch: (prompt: string, smiles?: string) => Promise<ApiResult<ProjectCreated>>;
  selectProject: (projectId: string) => Promise<void>;
  refreshProjects: () => void;
}

const NeoContext = createContext<NeoContextValue | null>(null);

export function NeoProvider({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<ApiHealth>("checking");
  const [socket, setSocket] = useState<SocketStatus>("idle");
  const [roster, setRoster] = useState<AgentSnapshot[] | null>(null);
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [graph, setGraph] = useState<GraphDescription | null>(null);
  const [projects, setProjects] = useState<LoadState<Project[]>>({ state: "loading" });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runRecord, setRunRecord] = useState<LoadState<RunRecord>>({ state: "empty" });
  const [rejectedFrames, setRejectedFrames] = useState(0);
  const [liveRun, dispatch] = useReducer(runReducer, null, () => emptyRun(null));
  const [cursor, setCursorState] = useState<number | null>(null);
  const setCursor = useCallback((seq: number | null) => setCursorState(seq), []);
  // Replay is just a fold over a prefix of the same events - nothing is simulated.
  const run = useMemo(
    () => (cursor === null ? liveRun : foldAll(liveRun.runId, liveRun.events.filter((e) => e.seq <= cursor))),
    [liveRun, cursor],
  );

  const userChose = useRef(false);
  const runIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef(0);
  const buffer = useRef<NeoEvent[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- health -------------------------------------------------------------
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await getHealth();
      if (stopped) return;
      setHealth(result.status === "ok" ? "online" : "offline");
      timer = setTimeout(tick, result.status === "ok" ? HEALTH_POLL_ONLINE_MS : HEALTH_POLL_OFFLINE_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // --- reference data, loaded whenever the API (re)appears ---------------------
  const refreshProjects = useCallback(() => {
    void listProjects().then((r) => {
      if (r.status === "ok") setProjects(r.data.length ? { state: "ok", data: r.data } : { state: "empty" });
      else if (r.status === "offline") setProjects({ state: "offline" });
      else setProjects({ state: "error", message: r.message });
    });
  }, []);

  useEffect(() => {
    if (health !== "online") return;
    void listAgents().then((r) => r.status === "ok" && setRoster(r.data));
    void listTools().then((r) => r.status === "ok" && setTools(r.data));
    void getGraph().then((r) => r.status === "ok" && setGraph(r.data));
    refreshProjects();
  }, [health, refreshProjects]);

  // --- selecting a run ------------------------------------------------------------
  const selectRun = useCallback((nextRunId: string | null, nextProjectId: string | null) => {
    runIdRef.current = nextRunId;
    setCursorState(null);
    lastSeqRef.current = 0;
    buffer.current = [];
    setProjectId(nextProjectId);
    setRunId(nextRunId);
    dispatch({ type: "select", runId: nextRunId });
    if (!nextRunId) {
      setRunRecord({ state: "empty" });
      return;
    }
    setRunRecord({ state: "loading" });
    void getRun(nextRunId).then((r) => {
      if (runIdRef.current !== nextRunId) return; // user moved on
      if (r.status === "ok") setRunRecord({ state: "ok", data: r.data });
      else if (r.status === "offline") setRunRecord({ state: "offline" });
      else setRunRecord({ state: "error", message: r.message });
    });
  }, []);

  const selectProject = useCallback(
    async (id: string) => {
      userChose.current = true;
      const r = await getProject(id);
      if (r.status !== "ok") return;
      remember(id);
      selectRun(r.data.runs?.[0]?.id ?? null, id);
    },
    [selectRun],
  );

  // On first load, open the most recent project - which may be a run in progress.
  useEffect(() => {
    if (projects.state !== "ok" || userChose.current || runIdRef.current !== null) return;
    // the project chosen on another page (dashboard <-> lab) wins over "the latest", when it still exists
    const remembered = recall();
    const latest = projects.data.find((p) => p.id === remembered) ?? projects.data[0];
    if (latest) void selectProject(latest.id).then(() => (userChose.current = false));
  }, [projects, selectProject]);

  const launch = useCallback(
    async (prompt: string, smiles?: string) => {
      const result = await createProject({ prompt: prompt.trim(), smiles: smiles?.trim() || undefined });
      if (result.status === "ok") {
        userChose.current = true;
        remember(result.data.project.id);
        selectRun(result.data.run?.id ?? null, result.data.project.id);
        refreshProjects();
      }
      return result;
    },
    [selectRun, refreshProjects],
  );

  // --- the event stream ---------------------------------------------------------------
  useEffect(() => {
    if (!runId) {
      setSocket("idle");
      return;
    }
    const flush = () => {
      flushTimer.current = null;
      const batch = buffer.current;
      buffer.current = [];
      if (batch.length) dispatch({ type: "events", events: batch });
    };
    const connection = new EventSocket({
      baseUrl: WS_BASE,
      runId,
      getLastSeq: () => lastSeqRef.current,
      onStatus: setSocket,
      onEvent: (event) => {
        if (event.seq > lastSeqRef.current) lastSeqRef.current = event.seq;
        buffer.current.push(event);
        if (flushTimer.current === null) flushTimer.current = setTimeout(flush, EVENT_BATCH_MS);
      },
      onRejected: () => setRejectedFrames((n) => n + 1),
    });
    connection.open();
    return () => {
      connection.close();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = null;
    };
  }, [runId]);

  // Reconcile with the persisted history. The WebSocket can drop an event when
  // concurrent agents commit out of order (the server filters on seq > last), so
  // GET /api/events is treated as authoritative: periodically while the run is
  // active, and in full once it ends. The fold dedupes by seq, so this is a no-op
  // whenever the socket already delivered everything.
  const phaseRef = useRef(liveRun.phase);
  phaseRef.current = liveRun.phase;
  useEffect(() => {
    if (!runId || health !== "online") return;
    let stopped = false;
    const reconcile = async (from: number) => {
      const r = await listEvents(runId, from);
      if (stopped || runIdRef.current !== runId || r.status !== "ok") return;
      const events = r.data.map(parseEvent).filter((e): e is NeoEvent => e !== null);
      if (events.length === 0) return;
      const top = events[events.length - 1];
      if (top && top.seq > lastSeqRef.current) lastSeqRef.current = top.seq;
      dispatch({ type: "events", events });
    };
    const timer = setInterval(() => {
      const terminal = phaseRef.current === "completed" || phaseRef.current === "failed";
      if (!terminal) void reconcile(resumeSeq(lastSeqRef.current));
    }, RECONCILE_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [runId, health]);

  useEffect(() => {
    if (!runId || health !== "online" || (liveRun.phase !== "completed" && liveRun.phase !== "failed")) return;
    const timer = setTimeout(() => {
      void listEvents(runId, 0).then((r) => {
        if (runIdRef.current !== runId || r.status !== "ok") return;
        const events = r.data.map(parseEvent).filter((e): e is NeoEvent => e !== null);
        dispatch({ type: "events", events });
      });
    }, 700); // let the trailing status events land first
    return () => clearTimeout(timer);
  }, [runId, health, liveRun.phase]);

  // The run reaching a terminal state means the result package exists: fetch it.
  useEffect(() => {
    if (!runId || (liveRun.phase !== "completed" && liveRun.phase !== "failed")) return;
    void getRun(runId).then((r) => {
      if (runIdRef.current === runId && r.status === "ok") setRunRecord({ state: "ok", data: r.data });
    });
    refreshProjects();
  }, [runId, liveRun.phase, refreshProjects]);

  const agents = useMemo(() => buildAgentViews({ roster, run, health }), [roster, run, health]);

  const value = useMemo<NeoContextValue>(
    () => ({
      apiBase: API_BASE,
      health,
      socket,
      roster,
      tools,
      graph,
      projects,
      projectId,
      runId,
      run,
      liveRun,
      cursor,
      setCursor,
      runRecord,
      agents,
      rejectedFrames,
      launch,
      selectProject,
      refreshProjects,
    }),
    [health, socket, roster, tools, graph, projects, projectId, runId, run, liveRun, cursor, setCursor, runRecord, agents, rejectedFrames, launch, selectProject, refreshProjects],
  );

  return <NeoContext.Provider value={value}>{children}</NeoContext.Provider>;
}

export function useNeo(): NeoContextValue {
  const ctx = useContext(NeoContext);
  if (!ctx) throw new Error("useNeo must be used inside <NeoProvider>");
  return ctx;
}

/** The persisted final package, or null until the run has produced one. */
export function useRunResult() {
  const { runRecord, cursor } = useNeo();
  // the final package describes the END of the run; it is not shown while replaying an earlier moment
  return runRecord.state === "ok" && cursor === null ? runRecord.data.result : null;
}
