"""Research memory: what past investigations learned, kept in Hindsight.

    recall  - the Orchestrator, before the team works: past outcomes, flagged steps
    retain  - the Evaluator, after it decides: what was recommended, what was flagged and why

The Critic turns recalled flagged steps into lessons: a route that reuses a
reaction template flagged in an earlier investigation is marked and ranked down,
even when this run's tools pass it (a lab failure the models cannot see).

Point it at a server with VESYN_HINDSIGHT_URL (default http://127.0.0.1:8888 -
the `hindsight` service in docker-compose.yml; "none" disables memory).
HINDSIGHT_API_KEY is sent as a bearer token when set (Hindsight Cloud).
Memory is advisory: a missing server never fails a run.

Both operations are governed tools (registered at the bottom), so every recall
and retain is policy-checked, audited and on the event bus like any other.
"""
from __future__ import annotations

import os

import httpx

from backend.mas.gateway import PolicyError, Tool, register
from backend.mas.tools import iter_steps

BANK = os.environ.get("VESYN_HINDSIGHT_BANK", "vesyn-research")
FLAGGED, RECOMMENDED = "outcome:flagged", "outcome:recommended"
SIMULATED = "demo-seed"  # scripts/seed_memories.py: invented history, never shown as real


class MemoryUnavailable(RuntimeError):
    pass


def url() -> str:
    return os.environ.get("VESYN_HINDSIGHT_URL", "http://127.0.0.1:8888").rstrip("/")


def _post(op: str, body: dict, timeout: float = 30.0) -> dict:
    base = url()
    if base == "none":
        raise MemoryUnavailable("memory disabled (VESYN_HINDSIGHT_URL=none)")
    key = os.environ.get("HINDSIGHT_API_KEY")
    # Paths per the running server's /openapi.json (0.10.1): retain is POST .../memories.
    path = {"retain": "memories", "recall": "memories/recall"}[op]
    try:
        r = httpx.post(
            f"{base}/v1/default/banks/{BANK}/{path}", json=body,
            headers={"Authorization": f"Bearer {key}"} if key else None,
            timeout=httpx.Timeout(timeout, connect=5.0),
        )
        if r.status_code == 404:  # the bank is created by its first retain; until then it is empty
            return {}
        r.raise_for_status()
    except httpx.HTTPError as err:
        raise MemoryUnavailable(f"Hindsight {op} failed: {err}") from err
    return r.json()


def stored(limit: int = 500) -> set[str]:
    """document_ids Hindsight has finished extracting facts from. {} before the bank exists."""
    r = httpx.get(f"{url()}/v1/default/banks/{BANK}/memories/list", params={"limit": limit},
                  timeout=30)
    if r.status_code == 404:
        return set()
    r.raise_for_status()
    return {m["document_id"] for m in r.json().get("items", []) if m.get("document_id")}


def recall(query: str, max_tokens: int = 2048) -> list[dict]:
    out = _post("recall", {"query": query, "budget": "mid", "max_tokens": max_tokens})
    return [
        {
            "id": m["id"], "text": m["text"], "type": m.get("type"),
            "document_id": m.get("document_id"), "tags": m.get("tags") or [],
            "metadata": m.get("metadata") or {}, "score": (m.get("scores") or {}).get("final"),
        }
        for m in out.get("results", [])
    ]


def retain(items: list[dict]) -> dict:
    # async: Hindsight runs an LLM over every item to extract facts, and its worker paces and
    # retries that (a rate-limited provider answers 429). No run waits on it; a caller that
    # needs the memories to be queryable polls stored() instead.
    out = _post("retain", {"items": items, "async": True})
    return {"retained": len(items), "success": out.get("success"), "operation_id": out.get("operation_id")}


# --- pure: what to remember, and what a memory teaches -----------------------

def lessons(memories: list[dict]) -> dict[str, list[dict]]:
    """template_hash -> recalled memories that flagged it, one per retained item."""
    out: dict[str, list[dict]] = {}
    seen = set()
    for m in memories:
        if FLAGGED not in m["tags"] or (m["document_id"] or m["id"]) in seen:
            continue  # Hindsight may extract several facts from one retained item
        seen.add(m["document_id"] or m["id"])
        for tag in m["tags"]:
            if tag.startswith("rxn:"):
                out.setdefault(tag[4:], []).append(m)
    return out


def outcome_items(final: dict, request: str) -> list[dict]:
    """The Hindsight retain items for one finished run."""
    run_id, target = final["run_id"], final["target"]
    smiles = target["canonical_smiles"]
    matched = target.get("matched_name")
    name = matched or smiles
    tags = ["vesyn", f"target:{smiles}", f"task:{final['task']}"]
    items = [{
        # The report usually restates the recommendation, and an unnamed target would otherwise be
        # written as "SMILES (SMILES)": both waste the extraction model's context.
        "content": f"Investigation of {name}{f' ({smiles})' if matched else ''}, asked as "
                   f"\"{request}\". {final['report']}",
        "context": f"Vesyn {final['task']} investigation outcome",
        "document_id": run_id,
        "tags": tags,
        "metadata": {"kind": "investigation", "run_id": run_id, "target": smiles},
    }]
    flagged = set()
    for route in final["ranked_routes"]:
        rid = route["route_id"]
        steps = [rxn for _, rxn, _ in iter_steps(route["tree"])]
        hashes = [h for h in (s.get("template_hash") for s in steps) if h]
        if rid == final["recommended_route_id"]:
            items.append({
                "content": f"Route {rid} to {name} was recommended: {route['number_of_reactions']} "
                           f"step(s), {route['assessment']['label'].lower()}, score {route['score']}. "
                           f"Every step passed computational validation; nothing was run in a lab.",
                "context": "recommended retrosynthesis route",
                "document_id": f"{run_id}:route{rid}",
                "tags": tags + [RECOMMENDED] + [f"rxn:{h}" for h in hashes],
                "metadata": {"kind": "recommended_route", "run_id": run_id, "route_id": str(rid)},
            })
        for issue in route["critique"]["issues"]:
            # memory-sourced issues are old lessons, not new evidence: re-retaining them would echo
            if issue["severity"] != "high" or issue["step"] is None or issue["source"] == "memory":
                continue
            rxn = steps[issue["step"] - 1]
            key = rxn.get("template_hash")
            if not key or key in flagged:
                continue
            flagged.add(key)
            items.append({
                "content": f"In the retrosynthesis of {name}, route {rid} step {issue['step']} "
                           f"({rxn.get('reaction_smiles')}) was flagged by {issue['source']}: "
                           f"{issue['issue']} Routes using this transformation should be deprioritized.",
                "context": "flagged reaction step",
                "document_id": f"{run_id}:{key}",
                "tags": tags + [FLAGGED, f"rxn:{key}"],
                "metadata": {"kind": "flagged_step", "run_id": run_id, "route_id": str(rid),
                             "step": str(issue["step"]), "source": issue["source"],
                             "template_hash": key},
            })
    return items


# --- registry ------------------------------------------------------------

def _needs_query(args: dict) -> None:
    if not isinstance(args.get("query"), str) or not args["query"].strip():
        raise PolicyError("query must be a non-empty string")


def _needs_items(args: dict) -> None:
    items = args.get("items")
    if not isinstance(items, list) or not items or not all(
            isinstance(i, dict) and isinstance(i.get("content"), str) for i in items):
        raise PolicyError("items must be a non-empty list of {content: str, ...}")


register(Tool(
    name="hindsight.recall", version="hindsight-api-v1",
    description="Recall what past investigations learned: outcomes, flagged steps, recommended routes.",
    fn=lambda a: {"memories": recall(a["query"])},
    agents=frozenset({"planner", "user"}), station="library", check=_needs_query,
    summarize=lambda o: {"memories": len(o["memories"])},
))
register(Tool(
    name="hindsight.retain", version="hindsight-api-v1",
    description="Retain this investigation's outcome so future runs can learn from it.",
    fn=lambda a: retain(a["items"]),
    agents=frozenset({"evaluator", "user"}), station="report_desk", check=_needs_items,
    summarize=lambda o: o,
))
