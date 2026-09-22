# Vesyn — multi-agent architecture

Vesyn is RamChems (retrosynthesis, search, QSAR, reaction evidence) with a
multi-agent layer on top. The chemistry services are unchanged and still
tested by their own suites; the agent layer is new and lives in
[`backend/mas/`](../backend/mas).

```
 Frontend (React)                 Agent Lab: 3D office · agent graph · event feed · report
   │  REST /api/*   WS /ws/events   POST /agui (AG-UI over SSE)
 FastAPI  backend/api/main.py + routes_mas.py
   │
 LangGraph  backend/mas/graph.py
   START → planner ─┬→ research ─┐
                    └→ retro ────┴→ validator ─┬ pass ─────────→ critic → evaluator → END
                         ▲                     └ fail → replanner ┐
                         └────────────────────────────────────────┘
   │  every tool call goes through
 Tool gateway  backend/mas/gateway.py   policy → audit → run (thread) → audit → event
   │
 Tools  backend/mas/tools.py  — thin wrappers over the existing RamChems services
   AiZynthFinder · RDKit · ReactionT5 (microservice :8435) · ORD/USPTO evidence · QSAR · ChEMBL · PubChem · LLM
   │
 Postgres :5434 (one database)
   public.*  molecules, reaction evidence (RamChems)
   mas.*     projects, runs, tasks, events, tool_calls (audit), routes
```

## Principles

1. **Agents decide what to do; tools decide what is true.** No agent judges
   chemical validity. RDKit (template reversal), ReactionT5 (forward model)
   and the literature index do. The LLM only writes prose — the critic's
   notes and the final report — from those results, and a run is fully
   functional with no LLM at all (`VESYN_LLM=none`).
2. **Nothing is faked for the UI.** The office, graph and feed are pure
   functions of the event stream. Replay re-folds recorded events, so it
   shows exactly what happened.
3. **Every scientific action has provenance.** `mas.tool_calls` records who,
   which tool and version, why, the full input and output, timing and status —
   written *before* execution and updated after, so a crash still leaves a
   record. `GET /api/audit?run_id=…`.
4. **Degrade, don't fail.** A missing ReactionT5 service, evidence database or
   LLM downgrades the affected signal and shows up in the critique; only a
   failure of the core search (or an unresolvable target) fails the run.

## Agents

| id | Name | Does | Tools it may call |
|---|---|---|---|
| `planner` | Orchestrator | resolves the target (SMILES or name), creates the 7 tasks, briefs the team | `pubchem.resolve`, `rdkit.represent` |
| `research` | Research Agent | descriptors, solubility, nearest approved drugs — runs **in parallel** with retro | `rdkit.represent`, `qsar.solubility`, `chembl.similarity` |
| `retro` | Retrosynthesis Agent | AiZynthFinder search at the current budget | `aizynthfinder.plan` |
| `validator` | Validation Agent | per route, per step: RDKit template reversal, ReactionT5 forward prediction, ORD/USPTO precedent; then RamChems' rule-based assessment; checks starting materials | `rdkit.template_validation`, `reactiont5.forward_validation`, `ord.evidence` |
| `replanner` | Replanner | on a failed verdict, widens the search: 100 → 250 → 500 iterations, +5 routes per attempt, max 3 attempts | — |
| `critic` | Critic Agent | deterministic critique of each route (severity-ranked issues + strengths); optional LLM notes | `llm.generate` |
| `evaluator` | Route Evaluator | scores and ranks, persists routes, recommends one (or refuses to), writes the report | `llm.generate` |

**Verdict** (validator): pass if at least one solved route has no step marked
`REVIEW_REQUIRED` (a structural or ReactionT5 disagreement). Fail → replanner,
unless 3 attempts are used or the budget cannot be widened.

**Ranking score** (evaluator) — a heuristic over the available signals, *not a
feasibility probability*:
`0.35·assessment + 0.20·structural-match fraction + 0.20·evidence + 0.15·AiZynth state score + 0.10·(1/steps) − 0.05·high-severity issues`,
where evidence counts a direct precedent as 1 and a similar one as 0.5 per step.
If the top route still needs review, no route is recommended.

Decision functions (`next_search`, `after_validation`, `judge`, `critique`,
`score`) are pure and unit-tested in [`tests/test_mas.py`](../tests/test_mas.py).

## Tools and governance

`GET /api/tools` lists the registry: name, version, allowed agents, station.
A call is refused (`DENIED`, audited, `TOOL_FAILED` event) when the tool is
unknown, the agent is not on its allow-list, or the input fails its policy —
e.g. `aizynthfinder.plan` refuses `iteration_limit` > 500. Direct API use
(`POST /api/retrosynthesis`, `POST /api/validation`) goes through the same
gateway as principal `user`.

## API

| | |
|---|---|
| `POST /api/projects` | `{target, top_n?, iteration_limit?, name?, goal?, autostart?}` → project + run |
| `GET /api/projects`, `GET /api/projects/{id}` | projects (with their runs) |
| `POST /api/projects/{id}/runs` | run the team again |
| `GET /api/runs/{id}` | status and the final evidence package (`result`) |
| `GET /api/runs/{id}/routes`, `GET /api/routes/{id}` | ranked, persisted routes |
| `GET /api/agents`, `GET /api/agents/{id}` | live agent state |
| `GET /api/tasks?run_id=`, `GET /api/tasks/{id}` | tasks |
| `GET /api/tools`, `GET /api/graph` | tool registry; LangGraph nodes/edges |
| `GET /api/audit?run_id=`, `GET /api/audit/{call_id}` | provenance log; one call with full input/output |
| `GET /api/events?run_id=&after=` | persisted events |
| `WS /ws/events?run_id=&after=` | replay from `after`, then live tail |
| `POST /agui` | AG-UI `RunAgentInput` → SSE stream of AG-UI events |
| `POST /api/retrosynthesis` | one governed AiZynthFinder call, no agents |
| `POST /api/validation` | `{product, reactants[], template_smarts?}` → validate one step |

All RamChems endpoints (`/retrosynthesis/*`, `/search/*`, `/molecules/*`,
`/predict/*`) are unchanged.

## AG-UI

`POST /agui` accepts an AG-UI `RunAgentInput` (target from `state.target` or
the last user message; `threadId` becomes the project id) and streams:
`RUN_STARTED`, `STATE_SNAPSHOT`, `STEP_STARTED/FINISHED` per task,
`TOOL_CALL_START/ARGS/END/RESULT` per gateway call, `TEXT_MESSAGE_*` per
agent-to-agent message, every domain event as `CUSTOM`, and `RUN_FINISHED` (or
`RUN_ERROR`). Any AG-UI client can drive Vesyn without knowing LangGraph.

## LLM

`VESYN_LLM=<provider>:<model>` — `ollama:qwen3:14b` (default, local),
`anthropic:claude-sonnet-5` (`ANTHROPIC_API_KEY`), `openai:<model>`
(`OPENAI_API_KEY`, `OPENAI_BASE_URL` for any compatible server), or `none`.
Plain `httpx` calls in [`backend/mas/llm.py`](../backend/mas/llm.py); no vendor SDK.

## Decisions and what was deliberately left out

| Locked stack item | Status | Why |
|---|---|---|
| Python 3.12 | **3.11** | The existing `retrosynth` env is pinned (AiZynthFinder 4.4.1, RDKit 2023.09 coupled to the Postgres cartridge). Rebuilding it buys nothing for the MAS; move when AiZynthFinder and the cartridge move together. |
| LangGraph, FastAPI, AG-UI, gateway, Postgres, RDKit, AiZynthFinder, ReactionT5, LLM abstraction, WebSocket | **built** | |
| Redis | not added | Event fan-out is in-process (one API process). Needed only for several API processes — then publish through Redis pub/sub or Postgres `LISTEN/NOTIFY` in `events.publish`. |
| Celery | not added | AiZynthFinder is one ~1 GB instance behind a lock; a worker pool would each load it for no concurrency gain. Runs execute as asyncio tasks, one team at a time (`graph._team`). Add workers when throughput matters. |
| Qdrant | not added | Retrieval today is the fingerprint-keyed ORD/USPTO index in Postgres. Qdrant earns its place with literature/patent **text** — needs an embedding model and a corpus first. |
| OpenTelemetry + Langfuse | not added | The run → task → tool-call chain is already persisted and queryable (`mas.events`, `mas.tool_calls`). Add OTel spans in `gateway.call` when a trace UI is wanted. |
| React Flow | not used | The agent graph is 9 fixed nodes; hand-laid SVG. Switch when graphs become dynamic. |
| LangGraph checkpointer | not used | Runs are short and fully evented; an interrupted run is marked FAILED at startup and can be re-run. |

## Running

See the [README](../README.md#vesyn-agent-layer). Tests: `pytest tests/test_mas.py`.
