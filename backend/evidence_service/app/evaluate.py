"""Evaluation over the fixed case set in backend/eval/cases.json.

python -m app.evaluate                            # retrieval only: source recall
python -m app.evaluate --llm                      # plus the default LLM: citation validity, behaviour,
                                                  # abstention, version handling
python -m app.evaluate --model=ollama:qwen3:14b   # same, on a specific provider:model

Runs against its own project ("evalproject"), which is rebuilt from demo_data on every run.
Claim support is reviewed by hand: with --llm the findings are written to backend/eval/last_run.md.
"""
import json
import sys
from pathlib import Path

from .analysis import _norm, default_model, investigate
from .db import db, ensure_indexes
from .retrieval import hybrid_search, wait_indexed
from .seed import PROJECT, load, wipe

EVAL_DIR = Path(__file__).resolve().parents[1] / "eval"
CASES = json.loads((EVAL_DIR / "cases.json").read_text("utf-8"))
EVAL_PROJECT = {**PROJECT, "_id": "evalproject", "name": "Evaluation (synthetic)"}
PID = EVAL_PROJECT["_id"]


def run_case(case: dict, llm: bool, model_spec: str | None = None) -> dict:
    retrieved = hybrid_search(PID, case["question"], limit=8)
    got = {c["source_id"].removeprefix(f"{PID}-").rsplit("-v", 1)[0] for c in retrieved}
    expected = set(case["expected_sources"])
    row = {"id": case["id"], "type": case["type"],
           "recall": len(expected & got) / len(expected) if expected else None}
    if llm:
        res = investigate(EVAL_PROJECT, "evaluation", case["question"], [case["question"]], model_spec=model_spec)
        findings = res["findings"]
        statuses = {f["evidence_status"] for f in findings}
        stored = [c for f in findings for side in ("supporting", "contradicting") for c in f[side]]
        # Re-resolve every kept citation against the database, independently of the pipeline's own check.
        texts = {c["_id"]: c["text"] for c in db().chunks.find({"_id": {"$in": [c["chunk_id"] for c in stored]}})}
        row.update(
            statuses=sorted(statuses), findings=findings,
            emitted=res["citations_emitted"], rejected=res["citations_rejected"], stored=len(stored),
            stored_valid=sum(_norm(c["quote"]).strip(" .…") in _norm(texts.get(c["chunk_id"], "")) for c in stored),
            passed=bool(statuses & set(case["expect_status"]))
            and not statuses & set(case.get("forbid_status", []))
            and not {f["severity"] for f in findings} & set(case.get("forbid_severity", [])),
        )
    return row


def run(llm: bool = False, model_spec: str | None = None) -> dict:
    d = db()
    ensure_indexes()
    wipe(PID)
    for case in CASES:
        d.evaluation_cases.replace_one({"_id": case["id"]}, {**case, "_id": case["id"]}, upsert=True)

    rows = []
    for stage, folder in (("initial", "initial"), ("after_verification", "later")):
        failed = [s["filename"] for s in load(PID, folder) if s["status"] != "ready"]
        assert not failed, f"ingestion failed for {failed}"
        assert wait_indexed(PID, timeout=120), "search indexes did not catch up with ingested chunks"
        rows += [run_case(c, llm, model_spec) for c in CASES if c["stage"] == stage]

    def rate(selected):
        selected = list(selected)
        return sum(selected) / len(selected) if selected else None

    recalls = [r["recall"] for r in rows if r["recall"] is not None]
    metrics = {"source_recall": sum(recalls) / len(recalls)}
    if llm:
        emitted, stored = sum(r["emitted"] for r in rows), sum(r["stored"] for r in rows)
        metrics.update(
            citation_validity_stored=sum(r["stored_valid"] for r in rows) / stored if stored else 1.0,
            citation_validity_model=1 - sum(r["rejected"] for r in rows) / emitted if emitted else 1.0,
            behaviour_pass=rate(r["passed"] for r in rows),
            abstention=rate(r["passed"] for r in rows if r["type"] == "missing_evidence"),
            version_handling=rate(r["passed"] for r in rows if r["type"] == "historical_fix"),
            injection_resisted=rate(r["passed"] for r in rows if r["id"] == "c10"),
        )
        write_review(rows)
    return {"metrics": metrics, "rows": rows}


def write_review(rows: list[dict]) -> None:
    """Dump claims and quotes for the manual claim-support review."""
    by_id = {c["id"]: c for c in CASES}
    out = ["# Claim-support review", "", "For each finding, check by hand that the quotes support the claim.", ""]
    for r in rows:
        case = by_id[r["id"]]
        out += [f"## {r['id']} ({r['type']}) {'PASS' if r['passed'] else 'FAIL'}", "",
                f"Question: {case['question']}", f"Expected: {case['expected_behavior']}", ""]
        for f in r["findings"]:
            out.append(f"- [{f['evidence_status']} / {f['severity']}] {f['claim']}")
            out += [f"  - {side}: \"{c['quote']}\" ({c['chunk_id']})"
                    for side in ("supporting", "contradicting") for c in f[side]]
        out.append("")
    (EVAL_DIR / "last_run.md").write_text("\n".join(out), "utf-8")


if __name__ == "__main__":
    model = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--model=")), None)
    result = run(llm="--llm" in sys.argv or bool(model), model_spec=model)
    if model or "--llm" in sys.argv:
        print(f"model: {model or default_model()}\n")
    for r in result["rows"]:
        recall = "  n/a" if r["recall"] is None else f"{r['recall']:.2f}"
        extra = f"  {'PASS' if r['passed'] else 'FAIL'}  {','.join(r['statuses'])}" if "passed" in r else ""
        print(f"{r['id']}  {r['type']:<17} recall={recall}{extra}")
    print()
    for name, value in result["metrics"].items():
        print(f"{name:<26} {'n/a' if value is None else f'{value:.0%}'}")
