"""The tool gateway: no agent executes a tool directly.

    agent -> gateway -> policy -> audit -> tool -> audit -> result

Every call is checked against the tool's policy (which agents may call it, and
what inputs are acceptable) before it runs, recorded in mas.tool_calls before
and after, and announced on the event bus. That gives every scientific action
its provenance: who, what, why, input, tool, version, output, time, result.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Callable

from backend.mas import events, store


class PolicyError(PermissionError):
    """The call was refused before it ran."""


@dataclass(frozen=True)
class Tool:
    name: str
    version: str
    description: str
    #: Blocking; runs in a worker thread so the event loop stays responsive.
    fn: Callable[[dict], dict]
    #: Principals allowed to call it. "user" is a direct API call.
    agents: frozenset[str]
    #: Input policy. Raises PolicyError to refuse.
    check: Callable[[dict], None] = lambda args: None
    #: The small part of the output that goes on the event stream. The full
    #: output always goes to the audit log.
    summarize: Callable[[dict], dict] = lambda out: {}
    #: Where in the office the tool "lives" - the UI walks the agent there.
    station: str = "workstation"

    def describe(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "allowed_agents": sorted(self.agents),
            "station": self.station,
        }


REGISTRY: dict[str, Tool] = {}


def register(tool: Tool) -> Tool:
    REGISTRY[tool.name] = tool
    return tool


def _scalars(args: dict) -> dict:
    """Event-sized view of the input: route trees stay in the audit log."""
    return {
        k: v for k, v in args.items()
        if v is None or isinstance(v, (str, int, float, bool))
    }


async def call(
    name: str,
    args: dict,
    *,
    agent_id: str,
    reason: str,
    run_id: str | None = None,
    task_id: str | None = None,
) -> dict:
    call_id = store.new_id("tc")
    tool = REGISTRY.get(name)
    ctx = {"run_id": run_id, "agent_id": agent_id, "task_id": task_id}
    common = {"call_id": call_id, "tool": name}

    await asyncio.to_thread(store.insert, "mas.tool_calls", {
        "id": call_id, **ctx, "tool": name,
        "tool_version": tool.version if tool else None,
        "reason": reason, "input": args, "status": "REQUESTED",
    })
    await events.publish("TOOL_REQUESTED", **ctx, **common, reason=reason, input=_scalars(args))

    try:
        if tool is None:
            raise PolicyError(f"unknown tool {name!r}")
        if agent_id not in tool.agents:
            raise PolicyError(f"{agent_id!r} is not permitted to call {name}")
        tool.check(args)
    except PolicyError as err:
        await _finish(call_id, "DENIED", error=str(err))
        await events.publish("TOOL_FAILED", **ctx, **common, status="DENIED", error=str(err))
        raise

    await events.publish(
        "TOOL_STARTED", **ctx, **common, version=tool.version, station=tool.station,
        input=_scalars(args),
    )
    started = time.perf_counter()
    try:
        output = await asyncio.to_thread(tool.fn, args)
    except Exception as err:
        ms = int((time.perf_counter() - started) * 1000)
        await _finish(call_id, "FAILED", error=f"{type(err).__name__}: {err}", duration_ms=ms)
        await events.publish(
            "TOOL_FAILED", **ctx, **common, status="FAILED", error=str(err), duration_ms=ms,
        )
        raise

    ms = int((time.perf_counter() - started) * 1000)
    await _finish(call_id, "COMPLETED", output=output, duration_ms=ms)
    await events.publish(
        "TOOL_COMPLETED", **ctx, **common, version=tool.version, duration_ms=ms,
        summary=tool.summarize(output),
    )
    return output


async def _finish(call_id: str, status: str, **fields) -> None:
    await asyncio.to_thread(
        store.execute,
        "UPDATE mas.tool_calls SET status = %s, output = %s, error = %s, "
        "duration_ms = %s, finished_at = now() WHERE id = %s",
        status,
        store.adapt(fields.get("output")),
        fields.get("error"),
        fields.get("duration_ms"),
        call_id,
    )
