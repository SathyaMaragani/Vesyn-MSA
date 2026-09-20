# Event contract

Every agent action is an event. This is the contract between the backend and
any visualisation (the 3D office, the agent graph, an AG-UI client). The
frontend needs no chemistry — it listens.

## Transport

- `WS /ws/events?run_id=<id>&after=<seq>` — replays persisted events with
  `seq > after`, then tails live ones. Omit `run_id` for every run. Reconnect
  with the last `seq` you saw; nothing is lost or duplicated.
- `GET /api/events?run_id=&after=&limit=` — the same history over REST.
- `POST /agui` — the same events mapped to AG-UI (see ARCHITECTURE.md).

## Envelope

```json
{"seq": 42, "id": "ev_…", "type": "TOOL_STARTED", "run_id": "run_…",
 "agent_id": "retro", "task_id": "task_…", "ts": "2026-09-19T14:51:02.1+00:00",
 "data": { … }}
```

`seq` is the global order (Postgres `bigserial`). Concurrent agents can deliver
slightly out of order over the socket — sort by `seq`.

## Types and `data`

| type | agent_id | data |
|---|---|---|
| `RUN_STARTED` | — | `project_id, query, params{top_n, iteration_limit}` |
| `AGENT_STATUS_CHANGED` | the agent | `status, current_task, station` |
| `TASK_CREATED` / `TASK_ASSIGNED` | assignee | `title, attempt` / `title, assignee` |
| `TASK_STARTED` | assignee | — |
| `TASK_COMPLETED` | assignee | `output` |
| `TASK_FAILED` | assignee | `error` |
| `TOOL_REQUESTED` | caller | `call_id, tool, reason, input` (scalars only) |
| `TOOL_STARTED` | caller | `call_id, tool, version, station, input` |
| `TOOL_COMPLETED` | caller | `call_id, tool, version, duration_ms, summary` |
| `TOOL_FAILED` | caller | `call_id, tool, status` (`DENIED` by policy, or `FAILED`), `error` |
| `MESSAGE_SENT` | sender | `to` (agent id), `text` |
| `MOLECULE_RECEIVED` | planner | `smiles, query, name, source` (`smiles`/`pubchem`) |
| `ROUTE_GENERATED` | retro | `route_id, attempt, steps, state_score` |
| `VALIDATION_STARTED` | validator | `route_id, attempt, steps` |
| `VALIDATION_COMPLETED` | validator | `route_id, attempt, assessment, label, signals{tool: summary}` |
| `CRITIQUE_CREATED` | critic | `route_id, counts{high,medium,low,info}, headline, strengths` |
| `REPLAN_STARTED` | replanner | `reason, previous{attempt,iteration_limit,top_n}, next{…}` |
| `REPLAN_COMPLETED` | replanner | `next` |
| `PROJECT_COMPLETED` | — | `project_id, recommended_route_id, recommendation, routes` |
| `PROJECT_FAILED` | — | `project_id, error` |

Full outputs never ride on events — fetch them from `/api/audit/{call_id}` or
`/api/runs/{id}`.

## Agent statuses

`IDLE, QUEUED, PLANNING, WORKING, WAITING, COMMUNICATING, VALIDATING,
CRITICIZING, COMPLETED, FAILED`. Every agent returns to `IDLE` after a run.

## Stations (where things happen in the office)

| station | home of | tools there |
|---|---|---|
| `command_desk` | planner, replanner | `pubchem.resolve` |
| `library` | research | `chembl.similarity`, `qsar.solubility`, `ord.evidence` |
| `chemistry_workstation` | retro | `aizynthfinder.plan`, `rdkit.represent` |
| `validation_station` | validator | `rdkit.template_validation`, `reactiont5.forward_validation` |
| `review_room` | critic | — |
| `report_desk` | evaluator | `llm.generate` |

How the office reads them (`frontend/src/components/Office3D.tsx`):
`TOOL_STARTED` → the agent walks to the tool's station and its monitor lights
up until the matching `TOOL_COMPLETED/FAILED`; `MESSAGE_SENT` → the sender
walks to the recipient with a speech bubble; `AGENT_STATUS_CHANGED` →
visor/floor-ring colour. Otherwise an agent returns to its home desk.
