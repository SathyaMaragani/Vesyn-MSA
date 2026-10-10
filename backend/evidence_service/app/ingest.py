"""Ingestion: store the original, extract text with locations, chunk, embed, index.

Every chunk keeps its page or section so a citation can point back to a place in the source.
"""
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from functools import lru_cache

from pydantic import BaseModel
from pypdf import PdfReader

from .db import EMBED_MODEL, db, fs

FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
HEADING = re.compile(r"(#{1,6})\s+(.+)")


class RepoFile(BaseModel):
    path: str
    summary: str
    service: str | None = None
    lines: str | None = None
    excerpt: str | None = None


class RepoCommit(BaseModel):
    sha: str
    date: str
    message: str
    files: list[str] = []


class RepoSummary(BaseModel):
    """Structured repository summary: what was inspected, at which commit, with excerpts."""

    repository: str
    commit: str
    coverage: str
    files: list[RepoFile]
    commits: list[RepoCommit] = []
    title: str | None = None
    date: str | None = None
    owner: str | None = None


@lru_cache
def model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBED_MODEL)


def embed(texts: list[str]) -> list[list[float]]:
    return model().encode(texts, normalize_embeddings=True).tolist()


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def split_front_matter(text: str) -> tuple[dict, str]:
    """Read a leading `--- key: value ---` block (title, type, service, date, owner)."""
    m = FRONT_MATTER.match(text)
    if not m:
        return {}, text
    pairs = (line.split(":", 1) for line in m[1].splitlines() if ":" in line)
    return {k.strip(): v.strip() for k, v in pairs}, text[m.end():]


def md_segments(body: str) -> list[dict]:
    """Split Markdown at headings; each segment's section is its heading path below the H1 title."""
    segments, path, buf, fenced = [], [], [], False

    def flush():
        text = "\n".join(buf).strip()
        if text:
            segments.append({"text": text, "page": None, "section": " > ".join(path[1:] or path) or None})
        buf.clear()

    for line in body.splitlines():
        if line.lstrip().startswith("```"):
            fenced = not fenced
        m = None if fenced else HEADING.match(line)
        if m:
            flush()
            path[len(m[1]) - 1:] = [m[2].strip()]
        else:
            buf.append(line)
    flush()
    return segments


def repo_segments(summary: RepoSummary) -> list[dict]:
    """One segment per inspected file, keyed by path@commit, plus coverage and commit log."""
    segments = [{
        "text": f"Repository {summary.repository} inspected at commit {summary.commit}. Coverage: {summary.coverage}",
        "page": None,
        "section": "coverage",
    }]
    for f in summary.files:
        evidence = (
            f"Excerpt (lines {f.lines or 'unspecified'}):\n{f.excerpt}"
            if f.excerpt
            else "No excerpt was provided for this file: summary only, weaker evidence."
        )
        segments.append({
            "text": f"File {f.path} at commit {summary.commit}.\nSummary: {f.summary}\n{evidence}",
            "page": None,
            "section": f"{f.path}@{summary.commit}",
            "service": f.service,
        })
    if summary.commits:
        log = "\n".join(f"{c.sha} {c.date} {c.message} [files: {', '.join(c.files)}]" for c in summary.commits)
        segments.append({"text": f"Commit log for {summary.repository}:\n{log}", "page": None, "section": "commits"})
    return segments


def extract(filename: str, data: bytes) -> tuple[dict, list[dict]]:
    """Return (metadata, segments). A segment is {text, page, section[, service]}."""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        pages = PdfReader(io.BytesIO(data)).pages
        return {}, [
            {"text": text, "page": n, "section": None}
            for n, page in enumerate(pages, 1)
            if (text := (page.extract_text() or "").strip())
        ]
    if ext not in ("md", "markdown", "txt", "json"):
        raise ValueError(f"unsupported file type .{ext}; use PDF, Markdown, TXT or a repository-summary JSON")
    text = data.decode("utf-8-sig", errors="replace")
    if ext == "json":
        summary = RepoSummary.model_validate(json.loads(text))
        meta = {
            "title": summary.title or f"Repository summary {summary.repository}",
            "type": "repo_summary",
            "date": summary.date,
            "owner": summary.owner,
            "repo": {"repository": summary.repository, "commit": summary.commit, "coverage": summary.coverage},
        }
        return meta, repo_segments(summary)
    meta, body = split_front_matter(text)
    if ext == "txt":
        return meta, [{"text": body.strip(), "page": None, "section": None}] if body.strip() else []
    return meta, md_segments(body)


def _pack(units: list[str], sep: str, budget: int, count) -> list[str]:
    """Greedily join units into pieces that fit the budget."""
    out, buf = [], []
    for unit in units:
        if buf and count(sep.join(buf + [unit])) > budget:
            out.append(sep.join(buf))
            buf = []
        buf.append(unit)
    if buf:
        out.append(sep.join(buf))
    return out


def chunk_segments(segments: list[dict], budget: int = 120, count=lambda s: len(s.split())) -> list[dict]:
    """Split segments by paragraph into chunks of at most `budget` units.

    `count` defaults to words; ingestion passes the embedding model's tokenizer so chunks
    stay inside its token limit. Chunks never cross a page or section boundary.
    """
    chunks = []
    for seg in segments:
        units = []
        for para in re.split(r"\n\s*\n", seg["text"]):
            para = para.strip()
            if not para:
                continue
            if count(para) <= budget:
                units.append(para)
                continue
            # Oversized paragraph: fall back to lines/sentences, then to raw words.
            lines = [s for s in re.split(r"\n|(?<=[.!?])\s+", para) if s.strip()]
            lines = [w for s in lines for w in ([s] if count(s) <= budget else _pack(s.split(), " ", budget, count))]
            units += _pack(lines, "\n", budget, count)
        chunks += [{**seg, "text": text} for text in _pack(units, "\n\n", budget, count)]
    return chunks


def parse_date(value) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except ValueError:
        return None


def ingest_file(project_id: str, filename: str, data: bytes, meta: dict | None = None) -> dict:
    """Store and index one uploaded file. Returns the source document.

    Re-uploading the same filename with new content creates a new version; the previous
    version and its chunks are kept (latest=False) so older reports stay reproducible.
    Status moves uploaded -> processing -> ready | failed, and failures keep their error.
    """
    d = db()
    key = slug(filename.rsplit(".", 1)[0])
    checksum = hashlib.sha256(data).hexdigest()
    prev = d.sources.find_one({"project_id": project_id, "key": key, "latest": True})
    if prev and prev["checksum"] == checksum:
        return prev  # identical content is already indexed

    newest = d.sources.find_one({"project_id": project_id, "key": key}, sort=[("version", -1)])
    version = newest["version"] + 1 if newest else 1
    source_id = f"{project_id}-{key}-v{version}"
    fs().put(data, _id=source_id, filename=filename)
    d.sources.insert_one({
        "_id": source_id, "project_id": project_id, "key": key, "filename": filename,
        "version": version, "latest": False, "checksum": checksum, "status": "uploaded", "error": None,
        "uploaded_at": datetime.now(timezone.utc), "title": filename, "type": "document",
        "service": None, "date": None, "owner": None, "chunk_count": 0,
    })
    try:
        d.sources.update_one({"_id": source_id}, {"$set": {"status": "processing"}})
        extracted, segments = extract(filename, data)
        info = {**extracted, **{k: v for k, v in (meta or {}).items() if v}}
        fields = {
            "title": info.get("title") or filename,
            "type": info.get("type") or "document",
            "service": info.get("service") or None,
            "date": parse_date(info.get("date")),
            "owner": info.get("owner") or None,
            "repo": info.get("repo"),
        }
        m = model()
        # Leave room for the "title | section" prefix and special tokens added at embedding time.
        chunks = chunk_segments(segments, m.max_seq_length - 48, lambda s: len(m.tokenizer.tokenize(s)))
        if not chunks:
            raise ValueError("no extractable text (empty file or scanned PDF without a text layer)")
        vectors = embed([f"{fields['title']} | {c['section'] or ''}\n{c['text']}" for c in chunks])
        d.chunks.insert_many([
            {
                "_id": f"{source_id}-c{i:03d}", "source_id": source_id, "project_id": project_id, "idx": i,
                "text": c["text"], "embedding": vector, "page": c["page"], "section": c["section"],
                "service": c.get("service") or fields["service"], "date": fields["date"], "owner": fields["owner"],
                "source_type": fields["type"], "title": fields["title"], "version": version, "latest": True,
            }
            for i, (c, vector) in enumerate(zip(chunks, vectors))
        ])
        if prev:
            d.chunks.update_many({"source_id": prev["_id"]}, {"$set": {"latest": False}})
            d.sources.update_one({"_id": prev["_id"]}, {"$set": {"latest": False}})
        d.sources.update_one(
            {"_id": source_id},
            {"$set": {**fields, "status": "ready", "latest": True, "chunk_count": len(chunks)}},
        )
    except Exception as e:  # any failure must be visible on the source, not lost in a 500
        d.chunks.delete_many({"source_id": source_id})
        d.sources.update_one({"_id": source_id}, {"$set": {"status": "failed", "error": f"{type(e).__name__}: {e}"}})
    return d.sources.find_one({"_id": source_id})
