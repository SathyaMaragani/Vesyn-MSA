"""Postgres persistence for the agent layer.

Reuses the molecule-search connection pool: one DSN, one pool, one database.
All functions are blocking; async callers wrap them in asyncio.to_thread.
Table and column names only ever come from this codebase, never from a request.
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from psycopg.types.json import Jsonb

from backend.molrepr.search import pool

SCHEMA_SQL = Path(__file__).resolve().parents[2] / "db" / "init" / "04_mas.sql"


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def adapt(value: Any) -> Any:
    return Jsonb(value) if isinstance(value, (dict, list)) else value


def ensure_schema() -> None:
    with pool().connection() as conn:
        conn.execute(SCHEMA_SQL.read_text())


def insert(table: str, row: dict, returning: str | None = None) -> Any:
    cols = ", ".join(row)
    marks = ", ".join(["%s"] * len(row))
    sql = f"INSERT INTO {table} ({cols}) VALUES ({marks})"
    if returning:
        sql += f" RETURNING {returning}"
    with pool().connection() as conn:
        cur = conn.execute(sql, [adapt(v) for v in row.values()])
        return cur.fetchone()[returning] if returning else None


def update(table: str, id_: str, **fields) -> None:
    sets = ", ".join(f"{k} = %s" for k in fields)
    with pool().connection() as conn:
        conn.execute(
            f"UPDATE {table} SET {sets} WHERE id = %s",
            [adapt(v) for v in fields.values()] + [id_],
        )


def one(sql: str, *params) -> dict | None:
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchone()


def all_(sql: str, *params) -> list[dict]:
    with pool().connection() as conn:
        return conn.execute(sql, params).fetchall()


def execute(sql: str, *params) -> None:
    with pool().connection() as conn:
        conn.execute(sql, params)


def fail_interrupted_runs() -> int:
    """A run still RUNNING/QUEUED at startup belonged to a process that died."""
    with pool().connection() as conn:
        cur = conn.execute(
            "UPDATE mas.runs SET status = 'FAILED', error = 'interrupted by server restart', "
            "finished_at = now() WHERE status IN ('RUNNING', 'QUEUED')"
        )
        conn.execute(
            "UPDATE mas.tasks SET status = 'CANCELLED' WHERE status IN ('PENDING', 'RUNNING')"
        )
        conn.execute(
            "UPDATE mas.projects SET status = 'FAILED' WHERE status IN ('RUNNING', 'QUEUED')"
        )
        return cur.rowcount
