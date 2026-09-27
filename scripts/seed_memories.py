"""Seed the Hindsight research memory so a demo does not start from an empty bank.

    python scripts/seed_memories.py --reset          # wipe the bank, then seed
    python scripts/seed_memories.py --dry-run        # print what would be retained
    python scripts/seed_memories.py --save           # keep this bank as demo/bank-before.zip
    python scripts/seed_memories.py --restore        # put that bank back, in seconds

Seeding costs one LLM call per memory - minutes each on a local model, metered on a hosted one.
Seed once, --save, and every rehearsal afterwards is a --restore.

Two kinds of memory go in, and they are not mixed up:

  REAL        derived from `demo/runs/*.json` - runs this pipeline actually produced.
              Every flagged step is one ReactionT5, RDKit or literature result.
  SIMULATED   the lab and preference history a computational pipeline cannot know
              (a route that failed on scale-up, a chemist's preference). Tagged
              `demo-seed`, and the critic says "(simulated demo record)" whenever one
              changes a ranking, so invented history is never shown as measured.

Recording the runs: scripts/record_demo_runs.py writes demo/runs/*.json.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.mas import memory  # noqa: E402
from backend.mas.agents import HIGH_ISSUE_PENALTY, MEMORY_PENALTY  # noqa: E402
from backend.mas.tools import iter_steps  # noqa: E402

# What one step matching a recalled flag costs: the memory issue is severity high, so it is
# counted by both penalties in agents.score().
PENALTY_PER_STEP = HIGH_ISSUE_PENALTY + MEMORY_PENALTY

RUNS = ROOT / "demo" / "runs"
SNAPSHOT = ROOT / "demo" / "bank-before.zip"

GEFITINIB = "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1"

# The transformation the lab report condemns: coupling the aniline onto the quinazolin-4(3H)-one
# directly ([c:1]1([N:7][cH3:8])... >> O=[c:1]1... . [N:7][cH3:8]). It carries the recorded
# gefitinib run's top two routes; the 2-step route reaches the same C-N bond through the
# 4-chloroquinazoline instead, which is the route industrial syntheses of gefitinib use.
# Checked against demo/runs/gefitinib.json - assert_flip() fails if the routes stop matching.
QUINAZOLINONE_COUPLING = "870cb2d9c7fa2b66fd4b1aac4c7921b32e389fa8bfbe2c4b222789c602f13bd0"

# The one memory that changes the recommendation, and the reason it is honest to invent it:
# whether a reaction survives scale-up is not in RDKit, ReactionT5 or the literature index.
# Retained separately (--phase after) so a demo can show the decision before and after it.
LAB_REPORT = {
    "content": "Process chemistry ran the gefitinib route that couples the aniline directly onto "
               "the quinazolin-4(3H)-one. At 120 g the isolated yield fell from 68% to 31%, with "
               "the bis-arylated impurity as the main by-product: the aniline adds twice once the "
               "batch is hot for longer. The step was abandoned in favour of displacing the "
               "4-chloroquinazoline. Deprioritise routes that form this bond this way.",
    "context": "process chemistry outcome, gefitinib programme",
    # FLAGGED is what makes memory.lessons() treat this as a transformation to avoid; the rxn tag
    # is which transformation. Without both it is retained and recalled but changes no decision.
    "tags": [f"target:{GEFITINIB}", memory.FLAGGED, f"rxn:{QUINAZOLINONE_COUPLING}"],
    "metadata": {"kind": "scale_up_outcome", "compound": "gefitinib"},
}

# Invented history: what a lab learns and a chemist prefers, which no tool here can see.
SIMULATED = [
    {
        "content": "The medicinal chemistry team prefers routes with fewer protecting-group steps, "
                   "even at the cost of one extra coupling: deprotection losses have repeatedly "
                   "dominated overall yield in the quinazoline series.",
        "context": "researcher preference, quinazoline series",
        "tags": ["preference"],
        "metadata": {"kind": "researcher_preference"},
    },
    {
        "content": "A morpholinopropoxy analogue of the quinazoline series was dropped after its "
                   "aqueous solubility came in an order of magnitude below the programme's "
                   "threshold, despite acceptable predicted potency.",
        "context": "compound rejection, quinazoline series",
        "tags": ["rejected"],
        "metadata": {"kind": "rejected_compound"},
    },
    {
        "content": "Displacing the 4-chloroquinazoline with the aniline in isopropanol has been the "
                   "team's default for this series: it runs at reflux without a catalyst and the "
                   "hydrochloride salt drops out of the reaction mixture.",
        "context": "process note, quinazoline couplings",
        "tags": [f"target:{GEFITINIB}"],
        "metadata": {"kind": "process_note"},
    },
    {
        "content": "Chlorination of the quinazolinone with thionyl chloride needs the water out "
                   "first; a wet batch stalls at about half conversion and the product darkens.",
        "context": "process note, quinazoline chlorination",
        "tags": [f"target:{GEFITINIB}"],
        "metadata": {"kind": "process_note"},
    },
    {
        "content": "O-alkylation of the phenol with the chloropropylmorpholine is run before the "
                   "aniline is installed: doing it afterwards alkylates the secondary amine as well.",
        "context": "process note, quinazoline O-alkylation",
        "tags": [f"target:{GEFITINIB}"],
        "metadata": {"kind": "process_note"},
    },
]


def from_runs() -> list[dict]:
    """The real memories: what each recorded run concluded, in the bank's own schema."""
    if not RUNS.is_dir():
        sys.exit(f"no recorded runs in {RUNS} - run scripts/record_demo_runs.py first")
    items = []
    for path in sorted(RUNS.glob("*.json")):
        run = json.loads(path.read_text())
        items += memory.outcome_items(run["result"], run["request"])
    if not items:
        sys.exit(f"{RUNS} has no usable runs")
    return items


def as_simulated(items: list[dict]) -> list[dict]:
    return [
        {**item,
         "document_id": f"demo-seed:{item['metadata']['kind']}:{i}",
         "tags": ["vesyn", memory.SIMULATED, *item["tags"]],
         "metadata": {**item["metadata"], "provenance": "simulated"}}
        for i, item in enumerate(items, 1)
    ]


def assert_flip(before: list[dict], after: list[dict]) -> None:
    """Show what the demo's live run will actually recommend, before and after the lab report.

    Every seeded lesson counts, not just the lab report: a flag recorded while investigating one
    compound applies to the same transformation in another, so the routes of the demo's target are
    rescored by the whole bank. Checking the lab report alone would report a flip that the rest of
    the seed has already moved somewhere else.
    """
    path = RUNS / "gefitinib.json"
    if not path.exists():
        return
    routes = json.loads(path.read_text())["result"]["ranked_routes"]

    def winner(items: list[dict]) -> tuple[int, dict[int, float]]:
        lessons = memory.lessons([
            {"id": i["document_id"], "text": "", "document_id": i["document_id"],
             "tags": i["tags"], "metadata": {}, "score": None} for i in items])
        scores = {}
        for r in routes:
            hits = sum(rxn.get("template_hash") in lessons for _, rxn, _ in iter_steps(r["tree"]))
            scores[r["route_id"]] = r["score"] - PENALTY_PER_STEP * hits
        top = max(routes, key=lambda r: (scores[r["route_id"]], -r["number_of_reactions"]))
        return top["route_id"], scores

    was, before_scores = winner(before)
    now, after_scores = winner(after)
    print(f"flip check on demo/runs/gefitinib.json (penalty {PENALTY_PER_STEP:.2f} per flagged step):")
    for r in routes:
        print(f"   route {r['route_id']} ({r['number_of_reactions']} steps) {r['score']:.4f} -> "
              f"before {before_scores[r['route_id']]:.4f} -> after {after_scores[r['route_id']]:.4f}")
    if was == now:
        sys.exit(f"the lab report would not change the recommendation: route {was} wins either way. "
                 f"Flag a transformation the winner uses and a runner-up does not, or drop the "
                 f"lessons that already penalise every candidate.")
    print(f"   => recommendation moves from route {was} to route {now}")


def reset() -> None:
    r = httpx.delete(f"{memory.url()}/v1/default/banks/{memory.BANK}", timeout=60)
    print(f"reset bank {memory.BANK}: HTTP {r.status_code}")


# --- snapshots: seed once, rehearse many times -------------------------------------------------

def _await_transfer(op_id: str, what: str, timeout: float) -> dict:
    """Hindsight's transfers are async: poll the operation until it leaves 'pending'."""
    started = time.time()
    url = f"{memory.url()}/v1/default/banks/{memory.BANK}/operations/{op_id}"
    while True:
        op = httpx.get(url, timeout=30).json()
        if op.get("status") in ("completed", "succeeded", "failed", "error"):
            if op["status"] in ("failed", "error"):
                sys.exit(f"{what} failed: {op.get('error_message')}")
            return op
        if time.time() - started > timeout:
            sys.exit(f"{what} did not finish in {timeout:.0f}s (status {op.get('status')})")
        print(f"  {what}: {op.get('status')} after {time.time() - started:.0f}s")
        time.sleep(5)


def save(path: Path, timeout: float) -> None:
    """Write the bank as it stands to a file, so this state can be restored without re-extracting.

    Extraction is one LLM call per memory - minutes on a local model, and metered on a hosted one -
    which is a long wait to repeat before every rehearsal. A snapshot makes a reset instant.
    """
    base = f"{memory.url()}/v1/default/banks/{memory.BANK}"
    op = httpx.post(f"{base}/transfer/export", timeout=60).json()
    done = _await_transfer(op["operation_id"], "export", timeout)
    meta = done.get("result_metadata") or {}
    download = meta.get("download_url") or meta.get("url") or meta.get("path")
    if not download:
        sys.exit(f"the export finished but reported no file to fetch: {json.dumps(meta)[:300]}")
    if download.startswith("/"):
        download = f"{memory.url()}{download}"
    r = httpx.get(download, timeout=300, follow_redirects=True)
    r.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)
    print(f"saved bank {memory.BANK} -> {path} ({len(r.content) // 1024} KB)")


def restore(path: Path, timeout: float) -> None:
    if not path.exists():
        sys.exit(f"no snapshot at {path}: run --save once from a seeded bank first")
    base = f"{memory.url()}/v1/default/banks/{memory.BANK}"
    reset()
    # Hindsight's own "restore" mode insists on a bank that does not exist yet, and a deleted bank
    # is not that - the import then reports it as missing. Recreating it and merging into the empty
    # bank reaches the same state without depending on how a delete settles.
    httpx.put(base, json={}, timeout=60)
    with path.open("rb") as fh:
        op = httpx.post(f"{base}/transfer/import", params={"mode": "merge"},
                        files={"file": (path.name, fh, "application/zip")}, timeout=300).json()
    if "operation_id" not in op:
        sys.exit(f"import was refused: {json.dumps(op)[:300]}")
    _await_transfer(op["operation_id"], "import", timeout)
    found = memory.recall("previously flagged reaction steps and earlier investigation outcomes")
    lessons = memory.lessons(found)
    print(f"restored {path.name}: {len(found)} memories, {len(lessons)} flagged transformation(s) "
          f"-> {[h[:10] for h in lessons]}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--reset", action="store_true", help="delete the bank first (re-runnable seeding)")
    p.add_argument("--dry-run", action="store_true", help="print the items, retain nothing")
    p.add_argument("--timeout", type=float, default=1800,
                   help="seconds to wait for fact extraction (default 1800)")
    p.add_argument("--pace", type=float, default=30,
                   help="seconds between items, to stay inside a hosted provider's tokens-per-minute "
                        "limit (default 30; use 0 for a local model)")
    p.add_argument("--phase", choices=("before", "after", "all"), default="all",
                   help="before: everything except the lab report, so a run shows the old "
                        "recommendation. after: the lab report alone, which changes it. "
                        "all (default): the whole bank at once.")
    p.add_argument("--save", metavar="FILE", nargs="?", const=str(SNAPSHOT),
                   help=f"write the bank as it stands to FILE (default {SNAPSHOT.name}) and stop")
    p.add_argument("--restore", metavar="FILE", nargs="?", const=str(SNAPSHOT),
                   help="replace the bank with FILE and stop - seconds, no extraction, for rehearsals")
    args = p.parse_args()

    if memory.url() == "none":
        sys.exit("memory is disabled (VESYN_HINDSIGHT_URL=none)")
    if args.save:
        return save(Path(args.save), args.timeout)
    if args.restore:
        return restore(Path(args.restore), args.timeout)
    lab = as_simulated([LAB_REPORT])
    baseline = from_runs() + as_simulated(SIMULATED)
    assert_flip(baseline, baseline + lab)
    items = lab if args.phase == "after" else (
        baseline if args.phase == "before" else baseline + lab)
    kinds: dict[str, int] = {}
    for item in items:
        kinds[item["metadata"]["kind"]] = kinds.get(item["metadata"]["kind"], 0) + 1

    print(f"{len(items)} memories for bank {memory.BANK} at {memory.url()}: {kinds}")
    if args.dry_run:
        for item in items:
            print(f"\n--- {item['document_id']} {item['tags']}\n{item['content']}")
        return

    if args.reset:
        reset()
    started = time.time()
    # One item at a time, spaced out. Extraction is an LLM call per item, and a hosted provider
    # meters tokens per minute (Groq's free tier allows 8000, about one of these items every 26 s).
    # Handing over the whole batch at once trips that, and Hindsight then retries the batch with
    # minutes of backoff - slower than simply not exceeding the limit. --pace 0 for a local model.
    for n, item in enumerate(items, 1):
        memory.retain([item])
        print(f"  handed over {n}/{len(items)}: {item['document_id'][:60]}")
        if args.pace and n < len(items):
            time.sleep(args.pace)
    print(f"all {len(items)} handed to Hindsight in {time.time() - started:.0f}s; extracting facts...")

    # Extraction is one LLM call per item, so a rate-limited provider (Groq's free tier allows
    # 8000 tokens/minute) paces the batch over minutes. Hindsight's worker retries on 429, so
    # wait for the items to appear rather than treating a slow provider as a failure.
    want = {item["document_id"] for item in items}
    while (missing := want - memory.stored()):
        if time.time() - started > args.timeout:
            sys.exit(f"after {args.timeout}s, {len(missing)} item(s) are still not stored: "
                     f"{sorted(missing)}. Check `docker logs vesyn_hindsight` - a rate-limited "
                     f"provider retries for a while, a rejected key does not.")
        print(f"  {len(want) - len(missing)}/{len(want)} stored after {time.time() - started:.0f}s")
        time.sleep(20)
    print(f"all {len(want)} item(s) stored in {time.time() - started:.0f}s")

    found = memory.recall("previously flagged reaction steps and earlier investigation outcomes")
    lessons = memory.lessons(found)
    print(f"recall check: {len(found)} memories, {len(lessons)} flagged transformation(s) "
          f"-> {[h[:10] for h in lessons]}")
    if args.phase == "before":
        return
    if QUINAZOLINONE_COUPLING not in lessons:
        sys.exit("seeded, but the lab report did not come back as a lesson on that transformation - "
                 "the demo's recommendation would not change. Check the bank at :9999.")


if __name__ == "__main__":
    main()
