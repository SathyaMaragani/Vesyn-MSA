"""Run with: venv-evidence/Scripts/python -m pytest backend/evidence_service/tests"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis import reuse_keys  # noqa: E402
from app.retrieval import _scope  # noqa: E402


def finding(key, claim, *sources):
    return {"key": key, "claim": claim, "contradicting": [],
            "supporting": [{"source_id": f"proj-{s}-v1"} for s in sources]}


def test_renamed_findings_keep_their_previous_key():
    previous = [
        finding("gef-coupling", "Coupling yield fell at 120 g in batch GEF-0142", "batch-record-gef-0142", "route-proposal"),
        finding("gef-single-supplier", "The quinazolinone core has a single qualified supplier", "supply-register"),
        finding("gef-safety", "Step 2 has not had a safety assessment", "supply-register"),
    ]
    now = [
        finding("gefitinib-yield-scale", "Coupling yield fell at 120 g, verified fixed by a repeat batch",
                "batch-record-gef-0142", "repeat-batch-gef-0171"),  # renamed, and cites a new document
        finding("safety-missing", "Step 2 safety assessment has not been performed", "supply-register"),
        finding("gef-single-supplier", "Only one supplier is qualified for the core", "supply-register"),  # kept
        finding("pilot-scale", "Behaviour at 10 kg is unknown"),  # new
    ]
    reuse_keys(now, previous)
    assert [f["key"] for f in now] == ["gef-coupling", "gef-safety", "gef-single-supplier", "pilot-scale"]


def test_date_range_is_split_from_exact_filters():
    exact, span = _scope("p", {"service": "gefitinib", "owner": "", "date_from": "A", "date_to": None})
    assert exact == {"project_id": "p", "latest": True, "service": "gefitinib"} and span == {"gte": "A"}
