"""The event bus: every agent action becomes an event.

publish() persists the event to mas.events (which assigns its `seq`) and then
fans it out to every live subscriber - the /ws/events WebSocket and the AG-UI
stream. The frontend never needs to understand chemistry; it just listens.

Event shape (JSON):
    {"seq": 42, "id": "ev_...", "type": "TOOL_STARTED", "run_id": "run_...",
     "agent_id": "retro", "task_id": "task_...", "ts": "2026-...Z", "data": {...}}

ponytail: in-process fan-out. Correct for one API process; with several
processes, publish through Redis pub/sub (or Postgres LISTEN/NOTIFY) instead.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from backend.mas import store

logger = logging.getLogger("vesyn.events")

#: Every type the backend emits. docs/EVENTS.md describes each payload.
TYPES = frozenset({
    "AGENT_STATUS_CHANGED",
    "RUN_STARTED",
    "TASK_CREATED", "TASK_ASSIGNED", "TASK_STARTED", "TASK_COMPLETED", "TASK_FAILED",
    "TOOL_REQUESTED", "TOOL_STARTED", "TOOL_COMPLETED", "TOOL_FAILED",
    "MESSAGE_SENT",
    "MOLECULE_RECEIVED", "ROUTE_GENERATED",
    "VALIDATION_STARTED", "VALIDATION_COMPLETED",
    "CRITIQUE_CREATED",
    "REPLAN_STARTED", "REPLAN_COMPLETED",
    "PROJECT_COMPLETED", "PROJECT_FAILED",
})

_subscribers: set[asyncio.Queue] = set()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def publish(
    type: str,
    *,
    run_id: str | None = None,
    agent_id: str | None = None,
    task_id: str | None = None,
    **data,
) -> dict:
    if type not in TYPES:
        raise ValueError(f"unknown event type {type!r}")
    event = {
        "id": store.new_id("ev"),
        "type": type,
        "run_id": run_id,
        "agent_id": agent_id,
        "task_id": task_id,
        "ts": now(),
        "data": data,
    }
    event["seq"] = await asyncio.to_thread(store.insert, "mas.events", dict(event), "seq")
    for queue in list(_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            # A consumer this far behind is gone or stuck; it can resume from
            # /api/events?after=<last seq> rather than stall every agent.
            _subscribers.discard(queue)
            logger.warning("dropped a slow event subscriber")
    return event


def subscribe(maxsize: int = 5000) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _subscribers.discard(queue)


def history(run_id: str | None = None, after: int = 0, limit: int = 1000) -> list[dict]:
    """Persisted events, oldest first. Blocking."""
    rows = store.all_(
        "SELECT seq, id, type, run_id, agent_id, task_id, data, ts FROM mas.events "
        "WHERE seq > %s AND (%s::text IS NULL OR run_id = %s) ORDER BY seq LIMIT %s",
        after, run_id, run_id, limit,
    )
    for row in rows:
        row["ts"] = row["ts"].isoformat()
    return rows
