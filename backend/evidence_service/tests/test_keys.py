"""Run with: venv-evidence/Scripts/python -m pytest backend/evidence_service/tests"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.analysis import explain_changes, reuse_keys  # noqa: E402
from app.report import pick_lessons  # noqa: E402
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


def test_a_status_change_is_explained_when_the_model_stays_silent():
    old = {**finding("gef-coupling", "Coupling yield fell at 120 g", "batch"), "evidence_status": "fix_unverified"}
    now = [
        {**finding("gef-coupling", "Coupling yield fell at 120 g", "batch", "repeat"), "evidence_status": "resolved",
         "change_reason": ""},
        {**finding("other", "Unrelated", "batch"), "evidence_status": "supported", "change_reason": ""},
    ]
    explain_changes(now, [old], {"proj-batch-v1": "Batch Record", "proj-repeat-v1": "Repeat Batch Report"})
    assert now[0]["change_reason"] == (
        "Evidence status changed from fix unverified to resolved, based on newly cited evidence: Repeat Batch Report.")
    assert now[1]["change_reason"] == ""


def test_the_finding_most_about_a_step_speaks_for_it():
    filed = {f"c{i}": {"reaction_template": "coupling", "title": f"Doc {i}", "date": None} for i in (1, 2, 3)}

    def about(fid, status, chunks, severity="high"):
        return {"_id": fid, "claim": fid, "service": "gefitinib", "category": "scalability", "severity": severity,
                "evidence_status": status, "contradicting": [],
                "supporting": [{"chunk_id": c, "quote": f"quote from {c}"} for c in chunks]}

    broad = about("known issue across two compounds", "supported", ["c1", "x1", "x2"])  # 1 of 3 citations filed here
    own = about("coupling fixed and verified", "resolved", ["c1", "c2", "c3"])          # all of them
    unrelated = about("single supplier", "supported", ["x3"])
    undecided = about("not established", "not_established", ["c1"])

    (lesson,) = pick_lessons([broad, own, unrelated, undecided], filed)
    assert (lesson["finding_id"], lesson["open"], lesson["source_title"]) == ("coupling fixed and verified", False, "Doc 1")

    # equally about the step: the unresolved one wins, and a minor one is reported but not held against the route
    (lesson,) = pick_lessons([own, about("still failing", "fix_unverified", ["c2", "c3"])], filed)
    assert lesson["finding_id"] == "still failing" and lesson["open"] is True
    (lesson,) = pick_lessons([about("cosmetic", "supported", ["c1"], severity="low")], filed)
    assert lesson["open"] is False


def test_date_range_is_split_from_exact_filters():
    exact, span = _scope("p", {"service": "gefitinib", "owner": "", "date_from": "A", "date_to": None})
    assert exact == {"project_id": "p", "latest": True, "service": "gefitinib"} and span == {"gte": "A"}
