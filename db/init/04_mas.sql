-- Vesyn multi-agent layer. Idempotent: runs on first container start AND at
-- every API startup (backend/mas/store.py), so an existing volume picks it up
-- without being recreated.
CREATE SCHEMA IF NOT EXISTS mas;

CREATE TABLE IF NOT EXISTS mas.projects (
    id            text PRIMARY KEY,
    name          text        NOT NULL,
    goal          text        NOT NULL,
    -- What the user typed: a SMILES or a compound name.
    target_query  text        NOT NULL,
    -- Canonical SMILES, filled in once the planner resolves the query.
    target_smiles text,
    status        text        NOT NULL DEFAULT 'CREATED',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One execution of the agent graph for a project.
CREATE TABLE IF NOT EXISTS mas.runs (
    id          text PRIMARY KEY,
    project_id  text        NOT NULL REFERENCES mas.projects (id),
    status      text        NOT NULL,
    params      jsonb       NOT NULL DEFAULT '{}',
    result      jsonb,
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    started_at  timestamptz,
    finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS mas.tasks (
    id          text PRIMARY KEY,
    run_id      text        NOT NULL REFERENCES mas.runs (id),
    agent_id    text        NOT NULL,
    title       text        NOT NULL,
    status      text        NOT NULL,
    attempt     int         NOT NULL DEFAULT 1,
    output      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    started_at  timestamptz,
    finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS tasks_run_idx ON mas.tasks (run_id);

-- Every event the frontend ever saw, in order. The WebSocket is a live tail of
-- this table; /api/events replays it.
CREATE TABLE IF NOT EXISTS mas.events (
    seq      bigserial PRIMARY KEY,
    id       text        NOT NULL,
    type     text        NOT NULL,
    run_id   text,
    agent_id text,
    task_id  text,
    data     jsonb       NOT NULL DEFAULT '{}',
    ts       timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run_idx ON mas.events (run_id, seq);

-- The audit log: who called which tool, why, with what, and what came back.
-- Written BEFORE execution (status REQUESTED) and updated after, so a crash
-- mid-call still leaves a record.
CREATE TABLE IF NOT EXISTS mas.tool_calls (
    id           text PRIMARY KEY,
    run_id       text,
    task_id      text,
    agent_id     text        NOT NULL,
    tool         text        NOT NULL,
    tool_version text,
    reason       text,
    input        jsonb,
    output       jsonb,
    status       text        NOT NULL,
    error        text,
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    duration_ms  int
);
CREATE INDEX IF NOT EXISTS tool_calls_run_idx ON mas.tool_calls (run_id, started_at);

-- Final, ranked routes of a run. The full tree (steps, validation, evidence,
-- assessment) lives in `route`; steps are not split into rows because nothing
-- queries them independently yet.
CREATE TABLE IF NOT EXISTS mas.routes (
    id         text PRIMARY KEY,
    run_id     text        NOT NULL REFERENCES mas.runs (id),
    rank       int         NOT NULL,
    attempt    int         NOT NULL,
    score      double precision,
    assessment text,
    route      jsonb       NOT NULL,
    critique   jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routes_run_idx ON mas.routes (run_id, rank);
