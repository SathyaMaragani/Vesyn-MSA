"""Record the demo's history: run the real pipeline and keep each finished run.

    python scripts/record_demo_runs.py                 # gefitinib, the history the demo recalls
    python scripts/record_demo_runs.py --target erlotinib

Writes demo/runs/<name>.json ({"request", "target", "result"}), which
scripts/seed_memories.py turns into memories. Memory is off while recording, so a
recorded run never learns from an earlier one - the seeded bank is the only history.

Needs the API's dependencies: Postgres up, AiZynthFinder data downloaded, and
ReactionT5 on :8435 (without it, steps are not forward-checked and the flags the
demo depends on may be missing - the script says so and stops).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["VESYN_HINDSIGHT_URL"] = "none"  # recorded runs must not read or write memory
os.environ.setdefault("VESYN_LLM", "none")  # deterministic prose; the demo's own runs can narrate

OUT = ROOT / "demo" / "runs"

# Two EGFR inhibitors sharing the quinazoline core, so their routes share transformations.
# SMILES from PubChem: gefitinib CID 123631, erlotinib CID 176870.
TARGETS = {
    "gefitinib": "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1",
    "erlotinib": "COCCOc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC",
}


def forward_model_ready() -> bool:
    url = os.environ.get("VESYN_FORWARD_URL", "http://localhost:8435/predict")
    try:
        r = httpx.post(url, json={"reactants_smiles": ["CC(=O)OC(C)=O.O=C(O)c1ccccc1O"]}, timeout=120)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


def record(name: str, smiles: str, top_n: int) -> Path:
    from fastapi.testclient import TestClient

    from backend.api.main import app
    from backend.mas import store

    request = f"Find a synthesis route for {smiles}"
    with TestClient(app) as c:
        r = c.post("/api/projects", json={"target": request, "name": f"demo {name}", "top_n": top_n})
        r.raise_for_status()
        project_id, run_id = r.json()["project"]["id"], r.json()["run"]["id"]
        started = time.time()
        while (run := c.get(f"/api/runs/{run_id}").json())["status"] not in ("COMPLETED", "FAILED"):
            time.sleep(2)
        if run["status"] != "COMPLETED":
            sys.exit(f"{name}: run {run['status']}: {run.get('error')}")

        result = run["result"]
        flagged = [i for rt in result["ranked_routes"] for i in rt["critique"]["issues"]
                   if i["severity"] == "high" and i["step"] is not None]
        OUT.mkdir(parents=True, exist_ok=True)
        path = OUT / f"{name}.json"
        path.write_text(json.dumps(
            {"request": request, "target": name, "recorded_at": time.strftime("%Y-%m-%d"),
             "result": result}, indent=1))
        print(f"{name}: {len(result['ranked_routes'])} routes in {time.time() - started:.0f}s, "
              f"recommended {result['recommended_route_id']}, {len(flagged)} high-severity step "
              f"issue(s) -> {path.relative_to(ROOT)}")
        for i in flagged:
            print(f"   [{i['source']}] step {i['step']}: {i['issue'][:90]}")

        # The recording is the artefact; the database rows were only how it was produced.
        runs = [row["id"] for row in store.all_("SELECT id FROM mas.runs WHERE project_id = %s", project_id)]
        for table in ("mas.events", "mas.tool_calls", "mas.tasks", "mas.routes"):
            store.execute(f"DELETE FROM {table} WHERE run_id = ANY(%s)", runs)
        store.execute("DELETE FROM mas.runs WHERE project_id = %s", project_id)
        store.execute("DELETE FROM mas.projects WHERE id = %s", project_id)
    return path


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--target", choices=sorted(TARGETS), default="gefitinib")
    p.add_argument("--top-n", type=int, default=5)
    p.add_argument("--allow-no-forward-model", action="store_true",
                   help="record even with ReactionT5 down (steps are then not forward-checked)")
    args = p.parse_args()

    if not forward_model_ready() and not args.allow_no_forward_model:
        sys.exit("ReactionT5 is not answering on :8435 - start it (see start-vesyn.ps1) so every "
                 "step is forward-checked, or pass --allow-no-forward-model")
    record(args.target, TARGETS[args.target], args.top_n)


if __name__ == "__main__":
    main()
