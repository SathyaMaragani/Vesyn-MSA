"""Vesyn multi-agent API: projects, runs, agents, tasks, tools, audit, events.

    POST /api/projects              create a project (and, by default, start a run)
    POST /api/projects/{id}/runs    run the agent team again
    GET  /api/runs/{id}             status + final evidence package
    GET  /api/agents                live agent states (drives the 3D office)
    GET  /api/events  WS /ws/events event history / live tail
    POST /agui                      the same run, streamed as AG-UI over SSE
    POST /api/retrosynthesis        one governed tool call, no agents
    POST /api/validation            validate a single reaction step
"""
from __future__ import annotations

import asyncio
from typing import Optional

import psycopg
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import AliasChoices, BaseModel, Field, ValidationError, model_validator

from backend.mas import agents, agui, events, gateway, graph, llm, store
from backend.molrepr import service as molservice
from backend.retrosynthesis.service import (
    DEFAULT_ITERATION_LIMIT,
    MAX_ITERATION_LIMIT,
    InvalidRequestError,
    _enrich_with_assessment,
)

router = APIRouter(tags=["vesyn"])


class RunParams(BaseModel):
    top_n: int = Field(5, ge=1, le=25, description="Routes to validate per search attempt")
    iteration_limit: int = Field(
        DEFAULT_ITERATION_LIMIT, ge=1, le=MAX_ITERATION_LIMIT,
        description="MCTS iterations for the first attempt; the replanner widens it on failure",
    )


class ProjectCreate(RunParams):
    prompt: str = Field(
        "", validation_alias=AliasChoices("prompt", "target"),
        description="What to do, in plain words ('solubility of aspirin'), or just a SMILES / name",
    )
    smiles: Optional[str] = Field(
        None, description="Structure drawn in the editor; wins over any molecule named in the prompt")
    name: Optional[str] = Field(None, description="Defaults to the prompt")
    goal: Optional[str] = Field(None, description="Defaults to the prompt")
    autostart: bool = True

    @model_validator(mode="after")
    def _something_to_do(self):
        if not (self.prompt.strip() or (self.smiles or "").strip()):
            raise ValueError("give a prompt or draw a structure")
        return self


class RetroRequest(RunParams):
    smiles: str


class StepValidationRequest(BaseModel):
    product: str = Field(..., description="Product SMILES")
    reactants: list[str] = Field(..., min_length=1, description="Reactant SMILES")
    template_smarts: Optional[str] = Field(
        None, description="AiZynthFinder retro-template; enables the RDKit structural check")


def _404(what: str, id_: str):
    raise HTTPException(status_code=404, detail=f"no {what} with id {id_}")


def _project(project_id: str) -> dict:
    return store.one("SELECT * FROM mas.projects WHERE id = %s", project_id) or _404("project", project_id)


# --- projects & runs ------------------------------------------------------

@router.post("/api/projects", status_code=201)
async def create_project(body: ProjectCreate) -> dict:
    smiles = (body.smiles or "").strip() or None
    request = body.prompt.strip() or smiles
    project = {
        "id": store.new_id("proj"),
        "name": body.name or request[:120],
        "goal": body.goal or request,
        "target_query": request,
        "target_smiles": smiles,
    }
    await asyncio.to_thread(store.insert, "mas.projects", project)
    run = None
    if body.autostart:
        run = await graph.start_run(project, top_n=body.top_n, iteration_limit=body.iteration_limit)
    return {"project": await asyncio.to_thread(_project, project["id"]), "run": run}


@router.get("/api/projects")
def list_projects(limit: int = Query(50, ge=1, le=500)) -> list[dict]:
    return store.all_("SELECT * FROM mas.projects ORDER BY created_at DESC LIMIT %s", limit)


@router.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict:
    project = _project(project_id)
    project["runs"] = store.all_(
        "SELECT id, status, params, error, created_at, started_at, finished_at FROM mas.runs "
        "WHERE project_id = %s ORDER BY created_at DESC", project_id)
    return project


@router.post("/api/projects/{project_id}/runs", status_code=201)
async def rerun_project(project_id: str, body: RunParams) -> dict:
    project = await asyncio.to_thread(_project, project_id)
    return await graph.start_run(project, top_n=body.top_n, iteration_limit=body.iteration_limit)


@router.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
    return store.one("SELECT * FROM mas.runs WHERE id = %s", run_id) or _404("run", run_id)


@router.get("/api/runs/{run_id}/routes")
def run_routes(run_id: str) -> list[dict]:
    return store.all_("SELECT * FROM mas.routes WHERE run_id = %s ORDER BY rank", run_id)


@router.get("/api/routes/{route_id}")
def get_route(route_id: str) -> dict:
    return store.one("SELECT * FROM mas.routes WHERE id = %s", route_id) or _404("route", route_id)


# --- agents, tasks, tools, audit -----------------------------------------

class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="Chemist's question or instruction to the agent")
    run_id: Optional[str] = Field(None, description="Optional active run id to give context")


@router.get("/api/agents")
def list_agents() -> list[dict]:
    return list(agents.AGENTS.values())


@router.get("/api/agents/{agent_id}")
def get_agent(agent_id: str) -> dict:
    return agents.AGENTS.get(agent_id) or _404("agent", agent_id)


@router.post("/api/agents/{agent_id}/chat")
async def chat_with_agent(agent_id: str, body: AgentChatRequest) -> dict:
    if agent_id not in agents.ROSTER:
        _404("agent", agent_id)

    name, role_desc, station = agents.ROSTER[agent_id]
    current_state = agents.AGENTS.get(agent_id, {})

    allowed_tools = [
        f"{tool.name} ({tool.description})"
        for tool in gateway.REGISTRY.values()
        if agent_id in tool.agents
    ]
    tools_summary = "; ".join(allowed_tools) if allowed_tools else "none (pure reasoning/coordination)"

    run_context = ""
    if body.run_id:
        recent_events = events.history(run_id=body.run_id, after=0, limit=30)
        agent_events = [e for e in recent_events if e.get("agent_id") == agent_id]
        if agent_events:
            event_summaries = [f"- {e.get('type')}: {e.get('data', {})}" for e in agent_events[-5:]]
            run_context = f"\nRecent events for this agent in run {body.run_id}:\n" + "\n".join(event_summaries)

    system_prompt = (
        f"You are {name} ({agent_id}) in the Vesyn multi-agent retrosynthesis and discovery platform.\n"
        f"Specialty: {role_desc}\n"
        f"Lab Station: {station}\n"
        f"Tools you are authorized to invoke: {tools_summary}.\n"
        f"Current state: status={current_state.get('status')}, current_task={current_state.get('current_task')}.\n"
        f"{run_context}\n\n"
        "Guidelines:\n"
        "1. Speak in your agent persona with scientific authority and precision.\n"
        "2. Explain your reasoning, chemical constraints, or validation checks clearly.\n"
        "3. Never fabricate fake reaction DOIs or unmeasured numbers; adhere to empirical ground truth.\n"
        "4. Keep responses direct, informative, and engaging."
    )

    try:
        res = await asyncio.to_thread(llm.generate, system_prompt, body.message, max_tokens=600)
        return {
            "agent_id": agent_id,
            "name": name,
            "reply": res["text"],
            "source": "llm",
            "model": res.get("model"),
        }
    except llm.LLMUnavailable as err:
        fallback_reply = (
            f"**{name} ({agent_id.upper()})** — {role_desc}\n\n"
            f"• **Station:** `{station}`\n"
            f"• **Status:** `{current_state.get('status', 'IDLE')}`\n"
            f"• **Authorized Tools:** {tools_summary}\n\n"
            f"As the {name}, I work within the Vesyn multi-agent LangGraph workflow. "
            f"When an objective is launched, I execute my assigned tasks using empirical models, RDKit, "
            f"and literature evidence.\n\n"
            f"*(LLM narration offline: {err})*"
        )
        return {
            "agent_id": agent_id,
            "name": name,
            "reply": fallback_reply,
            "source": "expert_system",
            "model": None,
        }


@router.get("/api/graph")
def agent_graph() -> dict:
    return graph.describe()


@router.get("/api/tasks")
def list_tasks(run_id: Optional[str] = None, limit: int = Query(200, ge=1, le=1000)) -> list[dict]:
    return store.all_(
        "SELECT * FROM mas.tasks WHERE (%s::text IS NULL OR run_id = %s) "
        "ORDER BY created_at DESC LIMIT %s", run_id, run_id, limit)


@router.get("/api/tasks/{task_id}")
def get_task(task_id: str) -> dict:
    return store.one("SELECT * FROM mas.tasks WHERE id = %s", task_id) or _404("task", task_id)


@router.get("/api/tools")
def list_tools() -> list[dict]:
    return [tool.describe() for tool in gateway.REGISTRY.values()]


@router.get("/api/audit")
def audit(run_id: Optional[str] = None, limit: int = Query(200, ge=1, le=2000)) -> list[dict]:
    """The provenance log. Inputs/outputs are omitted here; fetch one call for them."""
    return store.all_(
        "SELECT id, run_id, task_id, agent_id, tool, tool_version, reason, status, error, "
        "started_at, finished_at, duration_ms FROM mas.tool_calls "
        "WHERE (%s::text IS NULL OR run_id = %s) ORDER BY started_at LIMIT %s",
        run_id, run_id, limit)


@router.get("/api/audit/{call_id}")
def audit_call(call_id: str) -> dict:
    return store.one("SELECT * FROM mas.tool_calls WHERE id = %s", call_id) or _404("tool call", call_id)


# --- direct, governed tool use (no agents) ---------------------------------

@router.post("/api/retrosynthesis")
async def retrosynthesis(body: RetroRequest) -> dict:
    try:
        return await gateway.call(
            "aizynthfinder.plan",
            {"smiles": body.smiles, "top_n": body.top_n, "iteration_limit": body.iteration_limit},
            agent_id="user", reason="Direct API request",
        )
    except gateway.PolicyError as err:
        raise HTTPException(status_code=403, detail=str(err)) from err
    except InvalidRequestError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err


@router.post("/api/validation")
async def validate_step(body: StepValidationRequest) -> dict:
    try:
        for smiles in [body.product, *body.reactants]:
            molservice.parse(smiles)
    except molservice.InvalidSmilesError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    tree = {
        "molecule_smiles": body.product,
        "reactions": [{
            "reactants": [{"molecule_smiles": r, "reactions": []} for r in body.reactants],
            "template_smarts": body.template_smarts,
            "template_used": None,
            "reaction_smiles": f"{'.'.join(body.reactants)}>>{body.product}",
        }],
    }
    signals = {}
    for tool in ("rdkit.template_validation", "reactiont5.forward_validation", "ord.evidence"):
        try:
            out = await gateway.call(tool, {"tree": tree}, agent_id="user",
                                     reason="Direct step validation request")
            tree, signals[tool] = out["tree"], out["summary"]
        except Exception as err:
            signals[tool] = {"error": str(err)}
    _enrich_with_assessment(tree)
    return {"step": tree["reactions"][0], "signals": signals}


# --- events -----------------------------------------------------------------

@router.get("/api/events")
def list_events(
    run_id: Optional[str] = None,
    after: int = Query(0, ge=0, description="Return events with seq greater than this"),
    limit: int = Query(1000, ge=1, le=10000),
) -> list[dict]:
    return events.history(run_id, after, limit)


@router.websocket("/ws/events")
@router.websocket("/ws/events/{run_id}/{after}")
async def ws_events(ws: WebSocket, run_id: Optional[str] = None, after: Optional[int] = None):
    """Live event tail. Pass ?after=<seq> to replay history first (no gaps, no duplicates).

    The path form carries the same two values for proxies that drop a WebSocket's query
    string (Tailscale Funnel, tailscale/tailscale#18651); the frontend uses it.
    """
    await ws.accept()
    queue = events.subscribe()  # before the replay, so nothing falls in between

    async def send() -> None:
        last = 0
        if after is not None:
            for event in await asyncio.to_thread(events.history, run_id, after, 10000):
                await ws.send_json(event)
                last = event["seq"]
        while True:
            event = await queue.get()
            if event["seq"] > last and (run_id is None or event["run_id"] == run_id):
                await ws.send_json(event)

    async def receive() -> None:  # returns when the client goes away
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass

    tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        events.unsubscribe(queue)


# --- AG-UI ------------------------------------------------------------------

@router.post("/agui")
async def agui_run(body: dict):
    """AG-UI endpoint: RunAgentInput in, an SSE stream of AG-UI events out.

    The target comes from state.target, else the last user message. threadId
    maps to a Vesyn project, so a thread can be re-run.
    """
    state = body.get("state") or {}
    query = state.get("target")
    for message in reversed(body.get("messages") or []):
        if not query and message.get("role") == "user" and isinstance(message.get("content"), str):
            query = message["content"].strip()
    if not query:
        raise HTTPException(status_code=400, detail="no target: set state.target or send a user message")
    try:
        params = RunParams(**{k: state[k] for k in ("top_n", "iteration_limit") if k in state})
    except ValidationError as err:
        raise HTTPException(status_code=400, detail=err.errors()) from err

    thread_id = body.get("threadId") or store.new_id("proj")
    project = await asyncio.to_thread(store.one, "SELECT * FROM mas.projects WHERE id = %s", thread_id)
    if project is None:
        project = {"id": thread_id, "name": query[:120], "goal": query,
                   "target_query": query}
        await asyncio.to_thread(store.insert, "mas.projects", project)

    queue = events.subscribe()
    try:
        run = await graph.start_run(project, top_n=params.top_n,
                                    iteration_limit=params.iteration_limit, run_id=body.get("runId"))
    except psycopg.errors.UniqueViolation as err:
        events.unsubscribe(queue)
        raise HTTPException(status_code=409, detail="runId already used") from err

    async def stream():
        try:
            yield agui.sse({"type": "RUN_STARTED", "threadId": thread_id, "runId": run["id"]})
            yield agui.sse({"type": "STATE_SNAPSHOT",
                            "snapshot": {"agents": list(agents.AGENTS.values()), "run_id": run["id"]}})
            while True:
                event = await queue.get()
                if event["run_id"] != run["id"]:
                    continue
                for item in agui.to_agui(event):
                    yield agui.sse(item)
                if event["type"] == "PROJECT_COMPLETED":
                    row = await asyncio.to_thread(
                        store.one, "SELECT result FROM mas.runs WHERE id = %s", run["id"])
                    yield agui.sse({"type": "STATE_SNAPSHOT", "snapshot": {"result": row["result"]}})
                    yield agui.sse({"type": "RUN_FINISHED", "threadId": thread_id, "runId": run["id"],
                                    "result": {"recommendation": event["data"]["recommendation"]}})
                    return
                if event["type"] == "PROJECT_FAILED":
                    yield agui.sse({"type": "RUN_ERROR", "message": event["data"]["error"]})
                    return
        finally:
            events.unsubscribe(queue)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
