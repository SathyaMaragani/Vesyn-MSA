"""Reporting: resolve citations to stored passages, diff investigations, export the Markdown brief."""
from collections import Counter

from .db import db

SIDES = ("supporting", "contradicting")


def enrich(findings: list[dict]) -> list[dict]:
    """Attach the stored passage and its source location to every citation."""
    ids = {c["chunk_id"] for f in findings for side in SIDES for c in f[side]}
    chunks = {c["_id"]: c for c in db().chunks.find({"_id": {"$in": list(ids)}}, {"embedding": 0})}
    for f in findings:
        for side in SIDES:
            for c in f[side]:
                chunk = chunks.get(c["chunk_id"])
                c["resolved"] = chunk is not None
                if chunk:
                    c.update({k: chunk[k] for k in
                              ("text", "page", "section", "title", "source_type", "date", "version", "latest", "service")})
    return findings


# Most serious first: an unresolved problem outranks a verified fix for the same reaction step.
LESSON_RANK = {"supported": 0, "conflicting": 1, "fix_unverified": 2, "resolved": 3}


def lessons(project_id: str) -> dict:
    """One lesson per reaction step, from the latest complete review.

    A finding speaks for a step when it cites a document filed under that step's reaction template.
    `open` means the problem is unresolved and not minor; a resolved finding is kept so the reader
    can see that a known problem was fixed and verified.
    """
    d = db()
    inv = d.investigations.find_one({"project_id": project_id, "status": "complete"}, sort=[("created_at", -1)])
    if not inv:
        return {"review_id": None, "reviewed_at": None, "lessons": []}
    findings = [f for f in d.findings.find({"investigation_id": inv["_id"]}) if f["evidence_status"] in LESSON_RANK]
    ids = {c["chunk_id"] for f in findings for side in SIDES for c in f[side]}
    filed = {c["_id"]: c for c in d.chunks.find({"_id": {"$in": list(ids)}, "reaction_template": {"$ne": None}},
                                                {"reaction_template": 1, "title": 1, "date": 1})}
    return {"review_id": inv["_id"], "reviewed_at": inv["created_at"], "lessons": pick_lessons(findings, filed)}


def pick_lessons(findings: list[dict], filed: dict[str, dict]) -> list[dict]:
    """One lesson per reaction step. `filed` maps a passage id to {reaction_template, title, date}.

    Several findings can cite a document filed under the same step. The one that speaks for the step
    is the one most about it - the largest share of its citations are filed there - so a broad finding
    that merely cites the same batch record does not override the step's own. Ties go to the more serious.
    """
    severity = {"high": 0, "medium": 1, "low": 2}
    candidates = []
    for f in findings:
        if f["evidence_status"] not in LESSON_RANK:
            continue
        cites = [c for side in SIDES for c in f[side]]
        steps = Counter(filed[c["chunk_id"]]["reaction_template"] for c in cites if c["chunk_id"] in filed)
        candidates += [(-n / len(cites), LESSON_RANK[f["evidence_status"]], severity[f["severity"]], step, f)
                       for step, n in steps.items()]
    by_step: dict[str, dict] = {}
    for *_, step, f in sorted(candidates, key=lambda c: c[:3]):
        if step in by_step:
            continue
        resolved = f["evidence_status"] == "resolved"
        # Quote the failure for an open problem, the verification for a resolved one.
        ordered = [c for side in (SIDES[::-1] if resolved else SIDES) for c in f[side]]
        cite = next(c for c in ordered if filed.get(c["chunk_id"], {}).get("reaction_template") == step)
        chunk = filed[cite["chunk_id"]]
        by_step[step] = {
            "template_hash": step, "finding_id": f["_id"],
            "claim": f["claim"], "compound": f["service"], "category": f["category"],
            "severity": f["severity"], "evidence_status": f["evidence_status"],
            "open": not resolved and f["severity"] != "low",
            "quote": cite["quote"], "source_title": chunk["title"], "source_date": chunk["date"],
        }
    return list(by_step.values())


def compare(old: list[dict], new: list[dict]) -> dict:
    """Classify findings of a new investigation against the previous one.

    Findings are matched on (category, key). resolved = newly verified as fixed;
    updated = evidence status or severity changed; removed = no longer reported.
    """
    def ident(f):
        return f["category"], f["key"]

    def cited(f):
        return {c["source_id"] for side in SIDES for c in f[side]}

    before = {ident(f): f for f in old}
    after = {ident(f): f for f in new}
    diff = {"added": [], "updated": [], "resolved": [], "unchanged": [],
            "removed": [f for k, f in before.items() if k not in after]}
    for k, f in after.items():
        if k not in before:
            diff["added"].append({**f, "changes": [], "new_sources": sorted(cited(f))})
            continue
        prev = before[k]
        changes = [
            {"field": field, "from": prev[field], "to": f[field]}
            for field in ("evidence_status", "severity") if prev[field] != f[field]
        ]
        if f["evidence_status"] == "resolved" and prev["evidence_status"] != "resolved":
            bucket = "resolved"
        else:
            bucket = "updated" if changes else "unchanged"
        diff[bucket].append({**f, "changes": changes, "new_sources": sorted(cited(f) - cited(prev))})
    return diff


def _day(value) -> str:
    return value.date().isoformat() if value else "undated"


def _cite(c: dict) -> str:
    if not c.get("resolved"):
        return f"- \"{c['quote']}\" — (passage {c['chunk_id']} no longer stored)"
    where = (f"page {c['page']}" if c.get("page")
             else f"section \"{c['section']}\"" if c.get("section") else "whole document")
    return (f"- \"{c['quote']}\" — {c['title']} (v{c['version']}, {c['source_type']}, {_day(c.get('date'))}, "
            f"{where}) `{c['chunk_id']}`")


def brief(project: dict, inv: dict, findings: list[dict], diff: dict | None = None) -> str:
    """Render the exportable Markdown brief. `findings` must already be enriched."""
    sev = {"high": 0, "medium": 1, "low": 2}
    findings = sorted(findings, key=lambda f: (f["category"], sev[f["severity"]]))
    status = Counter(f["evidence_status"] for f in findings)
    out = [
        f"# Route Evidence Brief: {project['name']}",
        "",
        f"Investigation `{inv['_id']}` · {inv['created_at']:%Y-%m-%d %H:%M} UTC · model `{inv['model']}` · "
        f"prompt `{inv['prompt_version']}` · embeddings `{inv['embedding_model']}`",
        "",
        "> Severity is the potential impact if the risk is real. Evidence status is reported separately and "
        "describes what the sources establish. Retrieval rank is not confidence. \"Not established\" means not "
        "established from the available evidence.",
        "",
        "## Scope",
        "",
        f"- Compounds: {', '.join(project['services'])}",
        f"- Risk areas: {', '.join(project['scope']['areas'])}",
        *[f"- Open question: {q}" for q in project["scope"]["questions"]],
        "",
        "## Risk register",
        "",
        f"{len(findings)} findings: " + (", ".join(f"{n} {s}" for s, n in status.most_common()) or "none"),
        "",
        "| Finding | Category | Service | Potential severity | Evidence status |",
        "|---|---|---|---|---|",
        *[f"| {f['claim']} | {f['category']} | {f['service']} | {f['severity']} | {f['evidence_status']} |"
          for f in findings],
        "",
        "## Findings",
    ]
    for f in findings:
        out += [
            "",
            f"### {f['claim']}",
            "",
            f"- Category: {f['category']} · Service: {f['service']}",
            f"- Potential severity: **{f['severity']}** — {f['severity_rationale']}",
            f"- Evidence status: **{f['evidence_status']}**",
        ]
        if f.get("change_reason"):
            out.append(f"- Change since previous investigation: {f['change_reason']}")
        for side in SIDES:
            if f[side]:
                out += ["", f"{side.capitalize()} evidence:", "", *[_cite(c) for c in f[side]]]
        out += ["", f"- Limitation: {f['limitation'] or 'None stated.'}",
                f"- Next verification step: {f['next_step'] or 'None stated.'}"]

    open_items = [f for f in findings if f["evidence_status"] in ("not_established", "conflicting", "fix_unverified")]
    out += ["", "## Unresolved questions", ""]
    out += [f"- **{f['question']}** {f['claim']} ({f['evidence_status']}). Next: {f['next_step']}"
            for f in open_items] or ["- None."]

    if diff:
        out += ["", f"## Changes since investigation `{inv['previous_id']}`", ""]
        for bucket in ("resolved", "updated", "added", "removed"):
            for f in diff[bucket]:
                moved = "; ".join(f"{c['field']}: {c['from']} → {c['to']}" for c in f.get("changes", []))
                why = f.get("change_reason") or ""
                out.append(f"- **{bucket.capitalize()}**: {f['claim']}" + (f" ({moved})" if moved else "")
                           + (f" — {why}" if why else ""))
        if not any(diff[b] for b in ("resolved", "updated", "added", "removed")):
            out.append("- No changes.")

    out += ["", "## Evidence snapshot", "", "| Source | Version | Type | Date | SHA-256 |", "|---|---|---|---|---|"]
    out += [f"| {s['title']} | v{s['version']} | {s['type']} | {_day(s.get('date'))} | `{s['checksum'][:12]}` |"
            for s in inv["source_snapshot"]]
    return "\n".join(out) + "\n"
