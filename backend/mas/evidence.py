"""Document evidence: what the lab's own records say, served by the evidence service.

The service (backend/evidence_service, MongoDB Atlas behind it) indexes batch records,
deviations, proposals and lab notes, and answers from them with verified quotes.

Point it at a server with VESYN_EVIDENCE_URL (default http://127.0.0.1:8437; "none"
disables it) and a project with VESYN_EVIDENCE_PROJECT. Like memory, it is advisory:
an unreachable service is reported, and never fails a run.

Both operations are governed tools (registered at the bottom), so every search and
every question is policy-checked, audited and on the event bus like any other.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import httpx

from backend.mas.gateway import PolicyError, Tool, register

PROJECT = os.environ.get("VESYN_EVIDENCE_PROJECT", "gefitinibdemo")


class EvidenceUnavailable(RuntimeError):
    pass


def url() -> str:
    return os.environ.get("VESYN_EVIDENCE_URL", "http://127.0.0.1:8437").rstrip("/")


@lru_cache
def access_key() -> str:
    """The key a caller must send to upload, review or ask. Empty means no key is required.

    Read from VESYN_EVIDENCE_KEY, or from the repo's .env, which this API does not load itself.
    """
    key = os.environ.get("VESYN_EVIDENCE_KEY", "")
    env = Path(__file__).resolve().parents[2] / ".env"
    if not key and env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.startswith("VESYN_EVIDENCE_KEY="):
                key = line.split("=", 1)[1].strip()
    return key


def _request(method: str, path: str, timeout: float = 30.0, **kwargs):
    base = url()
    if base == "none":
        raise EvidenceUnavailable("document evidence disabled (VESYN_EVIDENCE_URL=none)")
    try:
        r = httpx.request(method, f"{base}/api/projects/{PROJECT}/{path}",
                          timeout=httpx.Timeout(timeout, connect=5.0), **kwargs)
        r.raise_for_status()
    except httpx.HTTPError as err:
        raise EvidenceUnavailable(f"evidence service {path} failed: {err}") from err
    return r.json()


def search(query: str, compound: str = "", doc_type: str = "") -> list[dict]:
    """Passages from the lab's documents, found by meaning and by exact words."""
    hits = _request("GET", "search", params={"q": query, "service": compound, "type": doc_type})
    return [
        {
            "passage_id": h["id"], "title": h["title"], "type": h["source_type"],
            "compound": h.get("service"), "date": (h.get("date") or "")[:10],
            "section": h.get("section"), "text": h["text"], "found_by": h.get("retrievers", []),
        }
        for h in hits
    ]


def _quotes(citations: list[dict]) -> list[dict]:
    return [{"quote": c["quote"], "title": c.get("title"), "passage_id": c["chunk_id"]} for c in citations]


def ask(question: str) -> dict:
    """One question answered from the documents: findings with verified quotes, or "not established"."""
    out = _request("POST", "ask", timeout=300.0, json={"question": question})
    return {
        "model": out["model_version"],
        "passages_retrieved": len(out["retrieved_chunk_ids"]),
        "quotes_rejected": out["citations_rejected"],
        "findings": [
            {
                "claim": f["claim"], "compound": f["service"], "severity": f["severity"],
                "evidence_status": f["evidence_status"], "limitation": f["limitation"],
                "next_step": f["next_step"], "supporting": _quotes(f["supporting"]),
                "contradicting": _quotes(f["contradicting"]),
            }
            for f in out["findings"]
        ],
    }


# --- registry ------------------------------------------------------------

def _needs_query(args: dict) -> None:
    if not isinstance(args.get("query"), str) or not args["query"].strip():
        raise PolicyError("query must be a non-empty string")


def _needs_question(args: dict) -> None:
    q = args.get("question")
    if not isinstance(q, str) or not 3 <= len(q.strip()) <= 500:
        raise PolicyError("question must be a string of 3 to 500 characters")


register(Tool(
    name="evidence.search", version="mongodb-atlas-hybrid",
    description="Search the lab's own documents (batch records, deviations, proposals) by meaning and exact words.",
    fn=lambda a: {"passages": search(a["query"], a.get("compound") or "", a.get("type") or "")},
    agents=frozenset({"validator", "critic", "user"}), station="library", check=_needs_query,
    summarize=lambda o: {"passages": len(o["passages"])},
))
register(Tool(
    name="evidence.ask", version="mongodb-atlas-rag",
    description="Answer one question from the lab's documents, with verified quotes or 'not established'.",
    fn=lambda a: ask(a["question"]),
    agents=frozenset({"critic", "user"}), station="library", check=_needs_question,
    summarize=lambda o: {"findings": len(o["findings"]),
                         "statuses": sorted({f["evidence_status"] for f in o["findings"]})},
))
