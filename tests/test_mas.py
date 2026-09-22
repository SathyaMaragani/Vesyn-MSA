"""Vesyn agent layer.

Unit tests for the decision logic run instantly. The end-to-end tests run the
real agent team (AiZynthFinder, RDKit, evidence DB) on aspirin, so they need
Postgres up and the model data downloaded, like test_retrosynthesis.py.
ReactionT5 and the LLM are optional: a missing one must degrade, not fail.
"""
import asyncio
import json
import os
import time

os.environ["VESYN_LLM"] = "none"  # deterministic prose; set before the app imports

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.mas import agents, agui, gateway, store

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"


# --- pure decision logic ---------------------------------------------------

def test_replanner_widens_then_caps():
    s = {"attempt": 1, "iteration_limit": 100, "top_n": 5}
    s2 = agents.next_search(s)
    s3 = agents.next_search(s2)
    assert (s2["iteration_limit"], s2["top_n"], s2["attempt"]) == (250, 10, 2)
    assert (s3["iteration_limit"], s3["top_n"]) == (500, 15)
    assert agents.next_search({"attempt": 3, "iteration_limit": 500, "top_n": 25})["iteration_limit"] == 500


def test_after_validation_routing():
    ok, bad = {"passed": True}, {"passed": False}
    first = {"attempt": 1, "iteration_limit": 100, "top_n": 5}
    assert agents.after_validation(ok, first) == "critic"
    assert agents.after_validation(bad, first) == "replanner"
    assert agents.after_validation(bad, {**first, "attempt": agents.MAX_ATTEMPTS}) == "critic"
    # nothing left to widen -> retrying would repeat the same search
    assert agents.after_validation(bad, {"attempt": 1, "iteration_limit": 500, "top_n": 25}) == "critic"


def _route(route_id, sv="MATCH", fv="MATCH", level="experimental", summary="STRONGLY_SUPPORTED", steps=1):
    node = {"molecule_smiles": "C", "reactions": []}
    tree = node
    for _ in range(steps):
        child = {"molecule_smiles": "C", "reactions": []}
        node["reactions"] = [{
            "reactants": [child], "reaction_smiles": "C>>C",
            "structural_validation": {"status": sv},
            "forward_validation": {"status": fv, "predicted_products": ["CC"]},
            "evidence": {"evidence_level": level},
        }]
        node = child
    return {"route_id": route_id, "tree": tree, "number_of_reactions": steps, "state_score": 0.9,
            "assessment": {"summary": summary, "label": summary.title()},
            "evidence_summary": {"evidence_coverage": 1.0 if level == "experimental" else 0.0}}


def test_judge():
    search = {"iteration_limit": 100}
    assert agents.judge([], search)["passed"] is False
    flagged = _route(0, sv="MISMATCH", summary="REVIEW_REQUIRED")
    assert agents.judge([flagged], search)["passed"] is False
    verdict = agents.judge([flagged, _route(1)], search)
    assert verdict["passed"] and verdict["usable_route_ids"] == [1]


def test_critique_flags_disagreement_and_missing_evidence():
    c = agents.critique(_route(0, sv="MISMATCH", fv="MISMATCH", level="unavailable"))
    assert c["counts"]["high"] == 2 and c["counts"]["medium"] == 1
    assert any("CC" in i["issue"] for i in c["issues"]), "names what ReactionT5 predicted"
    clean = agents.critique(_route(1))
    assert "high" not in clean["counts"] and clean["strengths"]


def test_forward_model_down_is_info_not_a_failure():
    c = agents.critique(_route(0, fv="MODEL_UNAVAILABLE"))
    assert c["counts"] == {"info": 1}


def test_score_prefers_direct_over_similar_precedent():
    direct = _route(0, summary="REVIEW_REQUIRED")
    similar = _route(1, level="similar_experimental", summary="REVIEW_REQUIRED")
    assert agents.score(direct, agents.critique(direct))[0] > agents.score(similar, agents.critique(similar))[0]


def test_score_prefers_validated_short_routes():
    good, _ = agents.score(_route(0), agents.critique(_route(0)))
    long_, _ = agents.score(_route(1, steps=4), agents.critique(_route(1, steps=4)))
    flagged_route = _route(2, sv="MISMATCH", summary="REVIEW_REQUIRED")
    flagged, _ = agents.score(flagged_route, agents.critique(flagged_route))
    assert good > long_ > flagged


def test_agui_mapping():
    ev = {"id": "ev_1", "type": "TOOL_STARTED", "agent_id": "retro", "task_id": "t",
          "data": {"call_id": "tc_1", "tool": "aizynthfinder.plan", "input": {"smiles": "C"}}}
    kinds = [e["type"] for e in agui.to_agui(ev)]
    assert kinds == ["TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "CUSTOM"]
    denied = {**ev, "type": "TOOL_FAILED", "data": {**ev["data"], "status": "DENIED", "error": "no"}}
    assert [e["type"] for e in agui.to_agui(denied)][:4] == [
        "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END", "TOOL_CALL_RESULT"]


# --- gateway policy (needs Postgres, not the model) --------------------------

def test_gateway_denies_unauthorised_agent_and_audits_it():
    with pytest.raises(gateway.PolicyError):
        asyncio.run(gateway.call("aizynthfinder.plan", {"smiles": ASPIRIN},
                                 agent_id="critic", reason="test"))
    row = store.one("SELECT status, error FROM mas.tool_calls WHERE agent_id = 'critic' "
                    "AND tool = 'aizynthfinder.plan' ORDER BY started_at DESC LIMIT 1")
    assert row["status"] == "DENIED" and "not permitted" in row["error"]


def test_gateway_enforces_search_budget():
    with pytest.raises(gateway.PolicyError, match="iteration_limit"):
        asyncio.run(gateway.call("aizynthfinder.plan", {"smiles": ASPIRIN, "iteration_limit": 10_000},
                                 agent_id="retro", reason="test"))


# --- end to end ----------------------------------------------------------------

# The API writes to the live database, so what these tests create is removed afterwards -
# by exact id, never by pattern, so nothing a person made while they ran is touched.
_MADE: list[str] = []


def _purge(project_ids: list[str]) -> None:
    runs = [r["id"] for r in store.all_("SELECT id FROM mas.runs WHERE project_id = ANY(%s)", project_ids)]
    for table in ("mas.events", "mas.tool_calls", "mas.tasks", "mas.routes"):
        store.execute(f"DELETE FROM {table} WHERE run_id = ANY(%s)", runs)
    store.execute("DELETE FROM mas.runs WHERE project_id = ANY(%s)", project_ids)
    store.execute("DELETE FROM mas.projects WHERE id = ANY(%s)", project_ids)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c
        if _MADE:
            _purge(_MADE)


def _wait(client, run_id, timeout=300):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in ("COMPLETED", "FAILED"):
            return run
        time.sleep(0.5)
    raise AssertionError(f"run {run_id} did not finish in {timeout}s")


@pytest.fixture(scope="module")
def aspirin_run(client):
    r = client.post("/api/projects", json={"target": ASPIRIN, "name": "aspirin e2e", "top_n": 3})
    assert r.status_code == 201
    _MADE.append(r.json()["project"]["id"])
    return _wait(client, r.json()["run"]["id"])


def test_run_completes_with_a_recommendation(aspirin_run):
    assert aspirin_run["status"] == "COMPLETED", aspirin_run["error"]
    result = aspirin_run["result"]
    assert result["target"]["canonical_smiles"] == ASPIRIN
    assert result["ranked_routes"], "aspirin solves at the default budget"
    assert [r["rank"] for r in result["ranked_routes"]] == list(range(1, len(result["ranked_routes"]) + 1))
    top = result["ranked_routes"][0]
    assert top["assessment"]["summary"] and top["critique"]["headline"]
    assert all(m["in_stock"] for m in top["starting_materials"])
    assert result["report"] and result["limitations"]
    assert result["profile"]["properties"]["formula"] == "C9H8O4"


def test_events_tell_the_story_in_order(client, aspirin_run):
    evs = client.get("/api/events", params={"run_id": aspirin_run["id"]}).json()
    types = [e["type"] for e in evs]
    for required in ("RUN_STARTED", "TASK_CREATED", "TASK_ASSIGNED", "TASK_STARTED", "TASK_COMPLETED",
                     "AGENT_STATUS_CHANGED", "TOOL_REQUESTED", "TOOL_STARTED", "TOOL_COMPLETED",
                     "MESSAGE_SENT", "MOLECULE_RECEIVED", "ROUTE_GENERATED", "VALIDATION_STARTED",
                     "VALIDATION_COMPLETED", "CRITIQUE_CREATED", "PROJECT_COMPLETED"):
        assert required in types, required
    order = ["MOLECULE_RECEIVED", "ROUTE_GENERATED", "VALIDATION_STARTED", "CRITIQUE_CREATED",
             "PROJECT_COMPLETED"]
    assert [types.index(t) for t in order] == sorted(types.index(t) for t in order)
    assert [e["seq"] for e in evs] == sorted(e["seq"] for e in evs)


def test_every_tool_call_is_audited(client, aspirin_run):
    calls = client.get("/api/audit", params={"run_id": aspirin_run["id"]}).json()
    by_tool = {c["tool"]: c for c in calls}
    assert by_tool["aizynthfinder.plan"]["agent_id"] == "retro"
    assert by_tool["rdkit.template_validation"]["agent_id"] == "validator"
    assert all(c["status"] in ("COMPLETED", "FAILED") and c["reason"] for c in calls)
    assert "llm.generate" not in by_tool, "narration disabled -> no LLM calls at all"
    full = client.get(f"/api/audit/{by_tool['aizynthfinder.plan']['id']}").json()
    assert full["input"]["smiles"] == ASPIRIN and full["output"]["is_solved"] is True


def test_tasks_complete_and_agents_go_idle(client, aspirin_run):
    tasks = client.get("/api/tasks", params={"run_id": aspirin_run["id"]}).json()
    assert tasks and all(t["status"] == "COMPLETED" for t in tasks)
    assert {a["status"] for a in client.get("/api/agents").json()} == {"IDLE"}


def test_routes_are_persisted(client, aspirin_run):
    routes = client.get(f"/api/runs/{aspirin_run['id']}/routes").json()
    assert routes and routes[0]["rank"] == 1
    assert client.get(f"/api/routes/{routes[0]['id']}").json()["route"]["tree"]


@pytest.mark.parametrize("form", ["/ws/events?run_id={id}&after=0", "/ws/events/{id}/0"])
def test_websocket_replays_history(client, aspirin_run, form):
    # the path form survives proxies that strip a WebSocket's query string
    with client.websocket_connect(form.format(id=aspirin_run["id"])) as ws:
        first = ws.receive_json()
    assert first["type"] == "RUN_STARTED" and first["run_id"] == aspirin_run["id"]


def test_unresolvable_target_fails_the_run_cleanly(client):
    r = client.post("/api/projects", json={"target": "definitely-not-a-molecule-zzqx"})
    _MADE.append(r.json()["project"]["id"])
    run = _wait(client, r.json()["run"]["id"])
    assert run["status"] == "FAILED" and run["error"]
    types = [e["type"] for e in client.get("/api/events", params={"run_id": run["id"]}).json()]
    assert "PROJECT_FAILED" in types and "TASK_FAILED" in types


def test_agui_stream(client):
    body = {"threadId": f"thread_test_{int(time.time())}", "messages": [{"role": "user", "content": ASPIRIN}],
            "state": {"top_n": 2}}
    _MADE.append(body["threadId"])
    kinds = []
    with client.stream("POST", "/agui", json=body) as r:
        assert r.status_code == 200
        for line in r.iter_lines():
            if line.startswith("data: "):
                kinds.append(json.loads(line[6:])["type"])
    assert kinds[0] == "RUN_STARTED" and kinds[-1] == "RUN_FINISHED"
    for required in ("STEP_STARTED", "TOOL_CALL_START", "TOOL_CALL_RESULT", "TEXT_MESSAGE_CONTENT",
                     "STATE_SNAPSHOT", "CUSTOM"):
        assert required in kinds, required


def test_direct_retrosynthesis_goes_through_the_gateway(client):
    r = client.post("/api/retrosynthesis", json={"smiles": ASPIRIN, "top_n": 1})
    assert r.status_code == 200 and r.json()["is_solved"] is True
    assert client.post("/api/retrosynthesis", json={"smiles": ASPIRIN, "iteration_limit": 501}).status_code == 400


def test_step_validation_endpoint(client):
    r = client.post("/api/validation", json={
        "product": ASPIRIN, "reactants": ["CC(=O)OC(C)=O", "O=C(O)c1ccccc1O"]})
    assert r.status_code == 200
    step = r.json()["step"]
    assert step["assessment"]["summary"]
    assert client.post("/api/validation", json={"product": "nope((", "reactants": ["C"]}).status_code == 400
