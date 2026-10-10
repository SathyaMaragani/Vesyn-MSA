"""Hybrid retrieval: Atlas Vector Search + Atlas Search, merged with reciprocal rank fusion."""
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

from .db import EMBED_DIMS, TEXT_INDEX, VECTOR_INDEX, db
from .ingest import embed


def rrf(rankings: list[list[str]], k: int = 60) -> list[str]:
    """Reciprocal rank fusion over ranked id lists. Returns ids, best first, without duplicates."""
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, id_ in enumerate(dict.fromkeys(ranking), 1):
            scores[id_] = scores.get(id_, 0) + 1 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)


def diversify(chunks: list[dict], per_source: int) -> list[dict]:
    """Cap chunks per source so one long document cannot dominate the evidence."""
    seen, out = Counter(), []
    for c in chunks:
        if seen[c["source_id"]] < per_source:
            seen[c["source_id"]] += 1
            out.append(c)
    return out


def _scope(project_id: str, filters: dict | None) -> dict:
    return {"project_id": project_id, "latest": True, **{k: v for k, v in (filters or {}).items() if v}}


def vector_search(project_id: str, vector: list[float], limit: int, filters: dict | None = None) -> list[dict]:
    return list(db().chunks.aggregate([
        {"$vectorSearch": {
            "index": VECTOR_INDEX, "path": "embedding", "queryVector": vector,
            "numCandidates": max(100, limit * 10), "limit": limit, "filter": _scope(project_id, filters),
        }},
        {"$project": {"embedding": 0}},
    ]))


def text_search(project_id: str, query: str, limit: int, filters: dict | None = None) -> list[dict]:
    return list(db().chunks.aggregate([
        {"$search": {
            "index": TEXT_INDEX,
            "compound": {
                "must": [{"text": {"query": query, "path": ["text", "title", "section"]}}],
                "filter": [{"equals": {"path": p, "value": v}} for p, v in _scope(project_id, filters).items()],
            },
        }},
        {"$limit": limit},
        {"$project": {"embedding": 0}},
    ]))


def hybrid_search(project_id: str, query: str, limit: int = 8, filters: dict | None = None,
                  per_source: int = 3, vector: list[float] | None = None) -> list[dict]:
    """Semantic + keyword search over the latest source versions.

    Each result carries `retrievers` (which searches found it). Rank is an ordering,
    not a confidence score.
    """
    vec = vector_search(project_id, vector or embed([query])[0], limit * 2, filters)
    txt = text_search(project_id, query, limit * 2, filters)
    by_id = {c["_id"]: c for c in vec + txt}
    vec_ids, txt_ids = [c["_id"] for c in vec], [c["_id"] for c in txt]
    for id_, c in by_id.items():
        c["retrievers"] = [name for name, ids in (("vector", vec_ids), ("text", txt_ids)) if id_ in ids]
    return diversify([by_id[i] for i in rrf([vec_ids, txt_ids])], per_source)[:limit]


def search_many(project_id: str, queries: list[str], limit: int) -> list[list[dict]]:
    """Run several hybrid searches concurrently (Atlas round trips dominate an investigation's time).

    Queries are embedded in one batch up front because the tokenizer is not safe to share across threads.
    """
    if not queries:
        return []
    with ThreadPoolExecutor(8) as pool:
        return list(pool.map(
            lambda q, v: hybrid_search(project_id, q, limit=limit, vector=v), queries, embed(queries)
        ))


def wait_indexed(project_id: str, timeout: float = 30) -> bool:
    """Search indexes update asynchronously; wait until they reflect the project's latest chunks."""
    d = db()
    scope = _scope(project_id, None)
    expected = d.chunks.count_documents(scope)
    probe = [1.0] + [0.0] * (EMBED_DIMS - 1)
    deadline = time.monotonic() + timeout
    while expected:
        text_n = next(d.chunks.aggregate([{"$searchMeta": {
            "index": TEXT_INDEX,
            "compound": {"filter": [{"equals": {"path": p, "value": v}} for p, v in scope.items()]},
            "count": {"type": "total"},
        }}]))["count"]["total"]
        vector_n = len(list(d.chunks.aggregate([
            {"$vectorSearch": {"index": VECTOR_INDEX, "path": "embedding", "queryVector": probe,
                               "exact": True, "limit": expected + 1, "filter": scope}},
            {"$project": {"_id": 1}},
        ])))
        if text_n == vector_n == expected:
            return True
        if time.monotonic() > deadline:
            return False
        time.sleep(1)
    return True
