"""The NeoChems brain: the agents wired into one LangGraph state machine.

    START -> planner -> research ─┐
                     -> retro ────┴-> validator ─┬─ PASS ──────────> critic -> evaluator -> END
                          ^                      └─ FAIL -> replanner ─┐
                          └────────────────────────────────────────────┘

research and retro run concurrently in one superstep, so the validator only
starts once both are done. On a replan only retro re-runs.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from backend.mas import agents, events, store
from backend.retrosynthesis.service import DEFAULT_ITERATION_LIMIT

logger = logging.getLogger("neochems.graph")


class RunState(TypedDict, total=False):
    # inputs
    run_id: str
    project_id: str
    query: str
    top_n: int
    iteration_limit: int
    # written by agents
    target: dict
    tasks: dict
    search: dict
    attempts: list
    profile: dict
    plan: dict
    routes: list
    verdict: dict
    critiques: list
    critic_notes: dict | None
    final: dict


def _route_after_validation(state: RunState) -> str:
    return agents.after_validation(state["verdict"], state["search"])


def build():
    g = StateGraph(RunState)
    for name, node in agents.NODES.items():
        g.add_node(name, node)
    g.add_edge(START, "planner")
    g.add_edge("planner", "research")
    g.add_edge("planner", "retro")
    g.add_edge("research", "validator")
    g.add_edge("retro", "validator")
    g.add_conditional_edges("validator", _route_after_validation, ["critic", "replanner"])
    g.add_edge("replanner", "retro")
    g.add_edge("critic", "evaluator")
    g.add_edge("evaluator", END)
    return g.compile()


GRAPH = build()


def describe() -> dict:
    """Nodes and edges for the frontend's agent-graph view."""
    drawable = GRAPH.get_graph()
    return {
        "nodes": [
            {"id": node_id, **({"agent": agents.AGENTS[node_id]} if node_id in agents.AGENTS else {})}
            for node_id in drawable.nodes
        ],
        "edges": [
            {"source": e.source, "target": e.target, "conditional": e.conditional}
            for e in drawable.edges
        ],
    }


# ponytail: one run at a time. The agents are a single team (and AiZynthFinder
# is one locked instance anyway); a second project queues behind the first.
# Parallel teams need per-run agent state and a worker pool of finders.
_team = asyncio.Lock()
_running: set[asyncio.Task] = set()


async def start_run(
    project: dict,
    *,
    top_n: int = 5,
    iteration_limit: int = DEFAULT_ITERATION_LIMIT,
    run_id: str | None = None,
) -> dict:
    run = {
        "id": run_id or store.new_id("run"),
        "project_id": project["id"],
        "status": "QUEUED",
        "params": {"top_n": top_n, "iteration_limit": iteration_limit},
    }
    await asyncio.to_thread(store.insert, "mas.runs", run)
    await asyncio.to_thread(store.update, "mas.projects", project["id"], status="QUEUED")
    task = asyncio.create_task(_execute(run, project))
    _running.add(task)
    task.add_done_callback(_running.discard)
    return run


async def _execute(run: dict, project: dict) -> None:
    run_id = run["id"]
    async with _team:
        await asyncio.to_thread(
            store.execute,
            "UPDATE mas.runs SET status = 'RUNNING', started_at = now() WHERE id = %s", run_id)
        await asyncio.to_thread(store.update, "mas.projects", project["id"], status="RUNNING")
        await events.publish("RUN_STARTED", run_id=run_id, project_id=project["id"],
                             query=project["target_query"], params=run["params"])
        try:
            state = await GRAPH.ainvoke(
                {
                    "run_id": run_id,
                    "project_id": project["id"],
                    "query": project["target_query"],
                    **run["params"],
                },
                {"recursion_limit": 50},
            )
            final = state["final"]
            await asyncio.to_thread(
                store.execute,
                "UPDATE mas.runs SET status = 'COMPLETED', result = %s, finished_at = now() "
                "WHERE id = %s",
                store.adapt(final), run_id)
            await asyncio.to_thread(store.update, "mas.projects", project["id"], status="COMPLETED")
            await events.publish(
                "PROJECT_COMPLETED", run_id=run_id, project_id=project["id"],
                recommended_route_id=final["recommended_route_id"],
                recommendation=final["recommendation"], routes=len(final["ranked_routes"]),
            )
        except Exception as err:
            logger.exception("run %s failed", run_id)
            message = f"{type(err).__name__}: {err}"
            await asyncio.to_thread(
                store.execute,
                "UPDATE mas.runs SET status = 'FAILED', error = %s, finished_at = now() WHERE id = %s",
                message, run_id)
            await asyncio.to_thread(
                store.execute,
                "UPDATE mas.tasks SET status = 'CANCELLED' WHERE run_id = %s "
                "AND status IN ('PENDING', 'RUNNING')", run_id)
            await asyncio.to_thread(store.update, "mas.projects", project["id"], status="FAILED")
            await events.publish("PROJECT_FAILED", run_id=run_id, project_id=project["id"],
                                 error=message)
        finally:
            await agents.reset_all(run_id)


async def cancel_all() -> None:
    for task in list(_running):
        task.cancel()
    await asyncio.gather(*_running, return_exceptions=True)
