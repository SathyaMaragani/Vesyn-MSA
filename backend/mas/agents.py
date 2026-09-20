"""The NeoChems workforce. Each agent is one LangGraph node (wired in graph.py).

Agents decide *what to do next*; tools decide *what is chemically true*. No
agent judges validity itself: RDKit, ReactionT5 and the literature index do,
and the LLM (when configured) only writes prose about their results.

Every agent action is visible: status changes, tasks, tool calls (through the
gateway) and messages to other agents all land on the event bus.
"""
from __future__ import annotations

import asyncio
import json
from collections import Counter
from contextlib import asynccontextmanager

from backend.mas import events, gateway, llm, store
from backend.mas.tools import iter_steps, leaves
from backend.retrosynthesis.route_assessment import aggregate_route_assessment
from backend.retrosynthesis.service import MAX_ITERATION_LIMIT, _enrich_with_assessment

MAX_ATTEMPTS = 3

# id -> (name, role, station). `station` is where the 3D office seats them.
ROSTER = {
    "planner": ("Orchestrator", "Resolves the target, plans the run, assigns tasks", "command_desk"),
    "research": ("Research Agent", "Profiles the target: descriptors, solubility, known analogues", "library"),
    "retro": ("Retrosynthesis Agent", "Searches routes to purchasable precursors with AiZynthFinder", "chemistry_workstation"),
    "validator": ("Validation Agent", "Checks every step with RDKit, ReactionT5 and literature precedent", "validation_station"),
    "critic": ("Critic Agent", "Finds the weaknesses in each validated route", "review_room"),
    "replanner": ("Replanner", "Widens the search when validation fails", "command_desk"),
    "evaluator": ("Route Evaluator", "Ranks routes and writes the evidence package", "report_desk"),
}

STATUSES = (
    "IDLE", "QUEUED", "PLANNING", "WORKING", "WAITING", "COMMUNICATING",
    "VALIDATING", "CRITICIZING", "COMPLETED", "FAILED",
)

#: Live state per agent - what GET /api/agents returns and the office renders.
AGENTS: dict[str, dict] = {
    agent_id: {
        "id": agent_id, "name": name, "role": role, "station": station,
        "status": "IDLE", "run_id": None, "current_task": None,
        "current_tool": None, "updated_at": None,
    }
    for agent_id, (name, role, station) in ROSTER.items()
}

# (task key, agent, title). The planner creates all of these up front.
PLAN = [
    ("research", "research", "Research target"),
    ("retro", "retro", "Generate retrosynthetic routes"),
    ("validate", "validator", "Validate reactions"),
    ("stock", "validator", "Check starting materials"),
    ("critique", "critic", "Critique routes"),
    ("rank", "evaluator", "Rank routes"),
    ("report", "evaluator", "Generate final report"),
]
RETRY_KEYS = ("retro", "validate", "stock")


# --- runtime plumbing ----------------------------------------------------

async def set_status(agent_id: str, status: str, run_id: str | None, **fields) -> None:
    agent = AGENTS[agent_id]
    agent.update(status=status, run_id=run_id, updated_at=events.now(), **fields)
    await events.publish(
        "AGENT_STATUS_CHANGED", run_id=run_id, agent_id=agent_id, status=status,
        current_task=agent["current_task"], station=agent["station"],
    )


async def reset_all(run_id: str) -> None:
    for agent_id, agent in AGENTS.items():
        if agent["status"] != "IDLE":
            await set_status(agent_id, "IDLE", run_id, current_task=None, current_tool=None)


async def create_task(run_id: str, agent_id: str, title: str, attempt: int = 1) -> str:
    task_id = store.new_id("task")
    await asyncio.to_thread(store.insert, "mas.tasks", {
        "id": task_id, "run_id": run_id, "agent_id": agent_id, "title": title,
        "status": "PENDING", "attempt": attempt,
    })
    ctx = {"run_id": run_id, "agent_id": agent_id, "task_id": task_id}
    await events.publish("TASK_CREATED", **ctx, title=title, attempt=attempt)
    await events.publish("TASK_ASSIGNED", **ctx, title=title, assignee=agent_id)
    return task_id


class Worker:
    """One agent, working one task, inside one run."""

    def __init__(self, agent_id: str, run_id: str, task_id: str) -> None:
        self.agent_id, self.run_id, self.task_id = agent_id, run_id, task_id
        self.output: dict = {}

    async def tool(self, name: str, args: dict, reason: str) -> dict:
        AGENTS[self.agent_id]["current_tool"] = name
        try:
            return await gateway.call(
                name, args, agent_id=self.agent_id, reason=reason,
                run_id=self.run_id, task_id=self.task_id,
            )
        finally:
            AGENTS[self.agent_id]["current_tool"] = None

    async def say(self, to: str, text: str) -> None:
        await events.publish(
            "MESSAGE_SENT", run_id=self.run_id, agent_id=self.agent_id,
            task_id=self.task_id, to=to, text=text,
        )

    async def publish(self, type: str, **data) -> None:
        await events.publish(
            type, run_id=self.run_id, agent_id=self.agent_id, task_id=self.task_id, **data,
        )


@asynccontextmanager
async def working(agent_id: str, run_id: str, task_id: str, status: str = "WORKING"):
    worker = Worker(agent_id, run_id, task_id)
    ctx = {"run_id": run_id, "agent_id": agent_id, "task_id": task_id}
    await asyncio.to_thread(
        store.execute,
        "UPDATE mas.tasks SET status = 'RUNNING', started_at = now() WHERE id = %s", task_id,
    )
    await events.publish("TASK_STARTED", **ctx)
    await set_status(agent_id, status, run_id, current_task=task_id)
    try:
        yield worker
    except Exception as err:
        await asyncio.to_thread(store.update, "mas.tasks", task_id, status="FAILED",
                                output={"error": str(err)})
        await events.publish("TASK_FAILED", **ctx, error=str(err))
        await set_status(agent_id, "FAILED", run_id, current_task=None)
        raise
    await asyncio.to_thread(
        store.execute,
        "UPDATE mas.tasks SET status = 'COMPLETED', output = %s, finished_at = now() WHERE id = %s",
        store.adapt(worker.output), task_id,
    )
    await events.publish("TASK_COMPLETED", **ctx, output=worker.output)
    await set_status(agent_id, "COMPLETED", run_id, current_task=None)


async def narrate(me: Worker, system: str, prompt: str, reason: str) -> dict | None:
    """LLM prose, or None. A missing LLM never fails a run."""
    if llm.spec() == "none":
        return None
    try:
        out = await me.tool("llm.generate", {"system": system, "prompt": prompt}, reason)
    except Exception:
        return None
    return out if out.get("text") else None


# --- decisions (pure, unit-tested) -----------------------------------------

def next_search(search: dict) -> dict:
    """Widen the search: 100 -> 250 -> 500 iterations, 5 more routes each time."""
    return {
        "attempt": search["attempt"] + 1,
        "iteration_limit": min(MAX_ITERATION_LIMIT, int(search["iteration_limit"] * 2.5)),
        "top_n": min(25, search["top_n"] + 5),
    }


def after_validation(verdict: dict, search: dict) -> str:
    """'critic' when validation passed or retrying cannot help, else 'replanner'."""
    if verdict["passed"] or search["attempt"] >= MAX_ATTEMPTS:
        return "critic"
    wider = next_search(search)
    can_widen = (wider["iteration_limit"], wider["top_n"]) != (
        search["iteration_limit"], search["top_n"])
    return "replanner" if can_widen else "critic"


def judge(routes: list[dict], search: dict) -> dict:
    if not routes:
        return {
            "passed": False, "usable_route_ids": [],
            "reason": f"No solved route within {search['iteration_limit']} MCTS iterations.",
        }
    usable = [r["route_id"] for r in routes if r["assessment"]["summary"] != "REVIEW_REQUIRED"]
    if usable:
        return {
            "passed": True, "usable_route_ids": usable,
            "reason": f"{len(usable)} of {len(routes)} route(s) have no step flagged by validation.",
        }
    return {
        "passed": False, "usable_route_ids": [],
        "reason": f"All {len(routes)} route(s) have at least one step flagged by validation.",
    }


def critique(route: dict) -> dict:
    """Deterministic critique of one validated route."""
    issues, strengths = [], []
    forward_missing = False
    structural = []
    for i, (product, rxn, _depth) in enumerate(iter_steps(route["tree"]), 1):
        at = {"step": i, "product": product, "reaction_smiles": rxn.get("reaction_smiles")}
        sv = (rxn.get("structural_validation") or {}).get("status")
        fwd = rxn.get("forward_validation") or {}
        fv = fwd.get("status")
        level = (rxn.get("evidence") or {}).get("evidence_level", "unavailable")
        structural.append(sv)

        if sv == "MISMATCH":
            issues.append({**at, "severity": "high", "source": "rdkit",
                           "issue": "Applying the template forwards to these precursors does not regenerate the product."})
        elif sv == "PARTIAL_MATCH":
            issues.append({**at, "severity": "medium", "source": "rdkit",
                           "issue": "The template regenerates the product only when stereochemistry is ignored."})
        elif sv != "MATCH":
            issues.append({**at, "severity": "low", "source": "rdkit",
                           "issue": "The structural check could not run on this step."})

        if fv == "MISMATCH":
            predicted = (fwd.get("predicted_products") or ["?"])[0]
            issues.append({**at, "severity": "high", "source": "reactiont5",
                           "issue": f"ReactionT5 predicts {predicted} rather than the intended product."})
        elif fv == "PARTIAL_MATCH":
            issues.append({**at, "severity": "medium", "source": "reactiont5",
                           "issue": "ReactionT5 reproduces the product only without stereochemistry."})
        elif fv == "MODEL_OUTPUT_INVALID":
            issues.append({**at, "severity": "medium", "source": "reactiont5",
                           "issue": "ReactionT5 produced no valid structure for this step."})
        elif fv != "MATCH":
            forward_missing = True

        if level == "experimental":
            strengths.append(f"Step {i} has a direct literature precedent.")
        elif level == "similar_experimental":
            issues.append({**at, "severity": "low", "source": "literature",
                           "issue": "Only similar, not identical, literature precedents."})
        else:
            issues.append({**at, "severity": "medium", "source": "literature",
                           "issue": "No precedent in the indexed ORD/USPTO data (absent from the index, "
                                    "not proven unknown)."})

    n = route["number_of_reactions"]
    if n >= 6:
        issues.append({"step": None, "severity": "medium", "source": "route",
                       "issue": f"Long route: {n} steps compound yield losses."})
    elif n >= 4:
        issues.append({"step": None, "severity": "low", "source": "route",
                       "issue": f"{n} steps - moderate length."})
    if forward_missing:
        issues.append({"step": None, "severity": "info", "source": "reactiont5",
                       "issue": "ReactionT5 was unavailable for at least one step, so it was not "
                                "independently forward-checked."})
    if structural and all(s == "MATCH" for s in structural):
        strengths.append("Every step passes the RDKit template check.")
    if n <= 2:
        strengths.append(f"Short route ({n} step{'s' if n > 1 else ''}).")

    counts = dict(Counter(i["severity"] for i in issues))
    headline = (
        f"{counts.get('high', 0)} high, {counts.get('medium', 0)} medium, "
        f"{counts.get('low', 0)} low severity issue(s)"
    )
    return {"route_id": route["route_id"], "issues": issues, "strengths": strengths,
            "counts": counts, "headline": headline}


WEIGHTS = {"assessment": 0.35, "structural": 0.20, "evidence": 0.20, "search": 0.15, "brevity": 0.10}
ASSESSMENT_VALUE = {
    "STRONGLY_SUPPORTED": 1.0, "SUPPORTED": 0.8,
    "INSUFFICIENT_EVIDENCE": 0.5, "REVIEW_REQUIRED": 0.1,
}
HIGH_ISSUE_PENALTY = 0.05


def score(route: dict, crit: dict) -> tuple[float, dict]:
    """Ranking heuristic over the available signals - NOT a feasibility probability."""
    steps = [rxn for _, rxn, _ in iter_steps(route["tree"])]
    n = max(len(steps), 1)
    levels = Counter((r.get("evidence") or {}).get("evidence_level") for r in steps)
    parts = {
        "assessment": ASSESSMENT_VALUE.get(route["assessment"]["summary"], 0.5),
        "structural": sum(
            (r.get("structural_validation") or {}).get("status") == "MATCH" for r in steps) / n,
        # A direct precedent is worth twice a merely similar one.
        "evidence": (levels["experimental"] + 0.5 * levels["similar_experimental"]) / n,
        "search": route.get("state_score") or 0.0,
        "brevity": 1 / n,
    }
    total = sum(WEIGHTS[k] * v for k, v in parts.items())
    total -= HIGH_ISSUE_PENALTY * crit["counts"].get("high", 0)
    return round(max(total, 0.0), 4), {k: round(v, 3) for k, v in parts.items()}


LIMITATIONS = [
    "Route scores rank candidates by the signals available; they are not yield or feasibility probabilities.",
    "AiZynthFinder templates come from USPTO patents (to ~2019); it recovers known chemistry and will not invent new reactions.",
    "'In stock' means present in the ZINC stock file - not priced, and not necessarily available at scale.",
    "'No precedent' means absent from the indexed ORD/USPTO data, not unknown to chemistry.",
    "ReactionT5 is a learned model; agreement is supporting evidence, not proof.",
    "Nothing here has been run in a lab.",
]


# --- the agents ------------------------------------------------------------

async def planner(state: dict) -> dict:
    run_id = state["run_id"]
    task_id = await create_task(run_id, "planner", "Plan the run")
    async with working("planner", run_id, task_id, "PLANNING") as me:
        target = await me.tool(
            "pubchem.resolve", {"query": state["query"]},
            "Resolve the requested target to one canonical structure",
        )
        smiles = target["canonical_smiles"]
        await me.publish("MOLECULE_RECEIVED", smiles=smiles, query=state["query"],
                         name=target.get("matched_name"), source=target["source"])
        await asyncio.to_thread(
            store.execute,
            "UPDATE mas.projects SET target_smiles = %s, updated_at = now() WHERE id = %s",
            smiles, state["project_id"],
        )
        tasks = {key: await create_task(run_id, agent, title) for key, agent, title in PLAN}
        search = {"attempt": 1, "iteration_limit": state["iteration_limit"], "top_n": state["top_n"]}
        await me.say("research", f"Profile {smiles}: descriptors, solubility, nearest approved drugs.")
        await me.say("retro", f"Find routes to {smiles} from purchasable stock: "
                              f"{search['iteration_limit']} MCTS iterations, top {search['top_n']}.")
        me.output = {"target_smiles": smiles, "tasks_created": len(tasks)}
    return {"target": target, "tasks": tasks, "search": search, "attempts": []}


async def research(state: dict) -> dict:
    run_id, smiles = state["run_id"], state["target"]["canonical_smiles"]
    async with working("research", run_id, state["tasks"]["research"]) as me:
        profile = {}
        for key, tool, reason in (
            ("properties", "rdkit.represent", "Drug-likeness descriptors of the target"),
            ("solubility", "qsar.solubility", "Predicted aqueous solubility of the target"),
            ("analogues", "chembl.similarity", "Closest approved drugs: known chemistry nearby"),
        ):
            try:
                profile[key] = await me.tool(tool, {"smiles": smiles}, reason)
            except Exception as err:  # a missing profile item never blocks synthesis planning
                profile[key] = {"error": str(err)}
        await me.say("critic", _profile_note(profile))
        me.output = {key: "error" not in value for key, value in profile.items()}
    return {"profile": profile}


def _profile_note(profile: dict) -> str:
    parts = []
    p = profile.get("properties", {})
    if "formula" in p:
        parts.append(f"{p['formula']}, MW {p['molecular_weight']}, logP {p['logp']}, "
                     f"{p['lipinski_violations']} Lipinski violation(s)")
    s = profile.get("solubility", {})
    if "predicted_value" in s:
        parts.append(f"solubility {s['predicted_value']} {s['units']}")
    hits = profile.get("analogues", {}).get("hits") or []
    if hits:
        parts.append(f"closest approved drug at Tanimoto {hits[0]['tanimoto']}")
    return "Target profile: " + ("; ".join(parts) if parts else "unavailable") + "."


async def retro(state: dict) -> dict:
    run_id, search = state["run_id"], state["search"]
    smiles = state["target"]["canonical_smiles"]
    async with working("retro", run_id, state["tasks"]["retro"]) as me:
        plan = await me.tool(
            "aizynthfinder.plan",
            {"smiles": smiles, "top_n": search["top_n"], "iteration_limit": search["iteration_limit"]},
            f"Attempt {search['attempt']}: search for routes down to purchasable precursors",
        )
        for route in plan["routes"]:
            await me.publish("ROUTE_GENERATED", route_id=route["route_id"], attempt=search["attempt"],
                             steps=route["number_of_reactions"], state_score=route["state_score"])
        if plan["routes"]:
            text = (f"{plan['routes_returned']} solved route(s) (of {plan['solved_routes_found']} found) "
                    f"in {plan['search_time_seconds']} s. Please validate every step.")
        else:
            text = (f"No solved route within {search['iteration_limit']} iterations "
                    f"({plan['search_time_seconds']} s).")
        await me.say("validator", text)
        me.output = {"is_solved": plan["is_solved"], "routes": plan["routes_returned"],
                     "search_time_seconds": plan["search_time_seconds"]}
    return {"plan": plan}


VALIDATION_TOOLS = (
    ("rdkit.template_validation", "Does each step's template, run forwards, regenerate its product?"),
    ("reactiont5.forward_validation", "Independent learned forward prediction of each step"),
    ("ord.evidence", "Literature precedent and reported conditions for each step"),
)


async def _validate_route(me: Worker, route: dict, attempt: int) -> dict:
    rid = route["route_id"]
    await me.publish("VALIDATION_STARTED", route_id=rid, attempt=attempt,
                     steps=route["number_of_reactions"])
    tree, signals = route["tree"], {}
    for tool, reason in VALIDATION_TOOLS:
        try:
            out = await me.tool(tool, {"tree": tree}, f"Route {rid}: {reason}")
            tree, signals[tool] = out["tree"], out["summary"]
        except Exception as err:  # one failed check degrades the route, never the run
            signals[tool] = {"error": str(err)}
    _enrich_with_assessment(tree)  # RamChems' rule-based combination of the three signals
    assessment = aggregate_route_assessment(tree)
    await me.publish("VALIDATION_COMPLETED", route_id=rid, attempt=attempt,
                     assessment=assessment["summary"], label=assessment["label"], signals=signals)
    evidence = signals.get("ord.evidence", {})
    return {
        **route, "attempt": attempt, "tree": tree, "signals": signals, "assessment": assessment,
        "evidence_summary": evidence if "error" not in evidence else None,
    }


async def validator(state: dict) -> dict:
    run_id, search, tasks, plan = state["run_id"], state["search"], state["tasks"], state["plan"]
    async with working("validator", run_id, tasks["validate"], "VALIDATING") as me:
        routes = list(await asyncio.gather(
            *(_validate_route(me, r, search["attempt"]) for r in plan["routes"])))
        verdict = judge(routes, search)
        me.output = verdict

    async with working("validator", run_id, tasks["stock"]) as me:
        for route in routes:
            route["starting_materials"] = [
                {"smiles": leaf["molecule_smiles"], "in_stock": bool(leaf.get("is_stock_available"))}
                for leaf in leaves(route["tree"])
            ]
        materials = {m["smiles"]: m["in_stock"] for r in routes for m in r["starting_materials"]}
        me.output = {"distinct_starting_materials": len(materials),
                     "not_in_stock": sorted(s for s, ok in materials.items() if not ok)}
        await me.say(after_validation(verdict, search), verdict["reason"])

    attempt = {
        "attempt": search["attempt"], "iteration_limit": search["iteration_limit"],
        "top_n": search["top_n"], "is_solved": plan["is_solved"],
        "solved_routes_found": plan["solved_routes_found"],
        "search_time_seconds": plan["search_time_seconds"], "verdict": verdict,
    }
    return {"routes": routes, "verdict": verdict, "attempts": state["attempts"] + [attempt]}


async def replanner(state: dict) -> dict:
    run_id, old = state["run_id"], state["search"]
    new = next_search(old)
    task_id = await create_task(run_id, "replanner", f"Replan search (attempt {new['attempt']})",
                                attempt=new["attempt"])
    async with working("replanner", run_id, task_id, "PLANNING") as me:
        reason = state["verdict"]["reason"]
        await me.publish("REPLAN_STARTED", reason=reason, previous=old, next=new)
        tasks = dict(state["tasks"])
        titles = {key: (agent, title) for key, agent, title in PLAN}
        for key in RETRY_KEYS:
            agent, title = titles[key]
            tasks[key] = await create_task(run_id, agent, f"{title} (attempt {new['attempt']})",
                                           attempt=new["attempt"])
        await me.say("retro", f"{reason} Retry with {new['iteration_limit']} iterations, "
                              f"top {new['top_n']} routes.")
        await me.publish("REPLAN_COMPLETED", next=new)
        me.output = new
    return {"search": new, "tasks": tasks}


CRITIC_SYSTEM = (
    "You are the critic on a retrosynthesis review team. You receive routes that "
    "deterministic tools have already checked (RDKit template reversal, the ReactionT5 "
    "forward model, literature precedent). Interpret only those signals: never claim a "
    "reaction works or fails beyond what they show, and never invent chemistry, yields or "
    "conditions. Write 4-6 plain sentences: which route looks strongest and why, the most "
    "serious weakness in each serious contender, and what a chemist should check first."
)

REPORT_SYSTEM = (
    "You write the executive summary of an automated retrosynthesis study for a medicinal "
    "chemist. Use only the facts given. State the recommendation (or that there is none), "
    "the evidence behind it, and the main risks, in one paragraph of at most 120 words. "
    "No markdown, no invented numbers."
)


def _route_brief(route: dict, crit: dict, **extra) -> dict:
    return {
        "route_id": route["route_id"], "steps": route["number_of_reactions"],
        "assessment": route["assessment"]["label"],
        "evidence_coverage": (route.get("evidence_summary") or {}).get("evidence_coverage"),
        "starting_materials": [m["smiles"] for m in route.get("starting_materials", [])],
        "issues": [f"[{i['severity']}] step {i['step']}: {i['issue']}" for i in crit["issues"][:8]],
        "strengths": crit["strengths"],
        **extra,
    }


async def critic(state: dict) -> dict:
    run_id, routes, verdict = state["run_id"], state["routes"], state["verdict"]
    async with working("critic", run_id, state["tasks"]["critique"], "CRITICIZING") as me:
        critiques = [critique(r) for r in routes]
        for c in critiques:
            await me.publish("CRITIQUE_CREATED", route_id=c["route_id"], counts=c["counts"],
                             headline=c["headline"], strengths=c["strengths"])
        notes = None
        if routes:
            prompt = json.dumps({
                "target": state["target"]["canonical_smiles"], "verdict": verdict["reason"],
                "routes": [_route_brief(r, c) for r, c in zip(routes, critiques)],
            }, indent=1)
            notes = await narrate(me, CRITIC_SYSTEM, prompt, "Summarise the critique for the evaluator")
        fallback = (
            "; ".join(f"route {c['route_id']}: {c['headline']}" for c in critiques)
            or f"Nothing to critique: {verdict['reason']}"
        )
        await me.say("evaluator", notes["text"] if notes else fallback)
        me.output = {"routes_critiqued": len(critiques), "llm_notes": bool(notes)}
    return {"critiques": critiques, "critic_notes": notes}


async def evaluator(state: dict) -> dict:
    run_id, verdict = state["run_id"], state["verdict"]
    by_id = {c["route_id"]: c for c in state["critiques"]}

    async with working("evaluator", run_id, state["tasks"]["rank"]) as me:
        scored = []
        for route in state["routes"]:
            total, breakdown = score(route, by_id[route["route_id"]])
            scored.append({**route, "score": total, "score_breakdown": breakdown,
                           "critique": by_id[route["route_id"]]})
        ranked = sorted(scored, key=lambda r: (-r["score"], r["number_of_reactions"]))
        for rank, route in enumerate(ranked, 1):
            route["rank"], route["db_id"] = rank, store.new_id("route")
            await asyncio.to_thread(store.insert, "mas.routes", {
                "id": route["db_id"], "run_id": run_id, "rank": rank, "attempt": route["attempt"],
                "score": route["score"], "assessment": route["assessment"]["summary"],
                "route": {k: v for k, v in route.items() if k != "critique"},
                "critique": route["critique"],
            })
        best = ranked[0] if ranked else None
        recommended = best if best and best["assessment"]["summary"] != "REVIEW_REQUIRED" else None
        me.output = {"ranked": [(r["route_id"], r["score"]) for r in ranked]}

    async with working("evaluator", run_id, state["tasks"]["report"]) as me:
        if recommended:
            recommendation = (
                f"Route {recommended['route_id']}: {recommended['number_of_reactions']} step(s), "
                f"{recommended['assessment']['label'].lower()}, score {recommended['score']}."
            )
        elif best:
            recommendation = ("No route can be recommended: every candidate has a step flagged "
                              "by validation. The best-scoring one is listed for review only.")
        else:
            recommendation = f"No route can be recommended: {verdict['reason']}"

        facts = json.dumps({
            "target": state["target"], "verdict": verdict["reason"],
            "attempts": len(state["attempts"]), "recommendation": recommendation,
            "critic_notes": (state.get("critic_notes") or {}).get("text"),
            "top_routes": [_route_brief(r, r["critique"], score=r["score"]) for r in ranked[:3]],
        }, indent=1)
        written = await narrate(me, REPORT_SYSTEM, facts, "Write the chemist-facing summary")
        report = written["text"] if written else (
            f"Target {state['target']['canonical_smiles']}. {verdict['reason']} "
            f"{len(ranked)} route(s) ranked after {len(state['attempts'])} search attempt(s). "
            f"{recommendation}"
        )
        final = {
            "run_id": run_id,
            "target": state["target"],
            "profile": state.get("profile"),
            "verdict": verdict,
            "attempts": state["attempts"],
            "recommended_route_id": recommended["route_id"] if recommended else None,
            "recommended_route_db_id": recommended["db_id"] if recommended else None,
            "recommendation": recommendation,
            "report": report,
            "report_source": f"llm:{written['provider']}:{written['model']}" if written else "template",
            "critic_notes": (state.get("critic_notes") or {}).get("text"),
            "ranked_routes": ranked,
            "limitations": LIMITATIONS,
            "audit": f"/api/audit?run_id={run_id}",
        }
        await me.say("planner", recommendation)
        me.output = {"recommended_route_id": final["recommended_route_id"]}
    return {"final": final}


NODES = {
    "planner": planner, "research": research, "retro": retro, "validator": validator,
    "replanner": replanner, "critic": critic, "evaluator": evaluator,
}
