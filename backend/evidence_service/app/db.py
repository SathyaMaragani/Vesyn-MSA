"""MongoDB connection and index setup.

Collections: projects, sources, chunks, investigations, findings, evaluation_cases.
Original uploads live in GridFS under the source id.
"""
import os
import time
from functools import lru_cache
from urllib.parse import quote, unquote

import gridfs
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.operations import SearchIndexModel

load_dotenv()

EMBED_MODEL = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBED_DIMS = int(os.getenv("EMBED_DIMS", "384"))
VECTOR_INDEX = "chunk_vector"
TEXT_INDEX = "chunk_text"

SEARCH_INDEXES = [
    SearchIndexModel(
        name=VECTOR_INDEX,
        type="vectorSearch",
        definition={
            "fields": [
                {"type": "vector", "path": "embedding", "numDimensions": EMBED_DIMS, "similarity": "cosine"},
                *[
                    {"type": "filter", "path": p}
                    for p in ("project_id", "latest", "service", "source_type", "owner", "date")
                ],
            ]
        },
    ),
    SearchIndexModel(
        name=TEXT_INDEX,
        type="search",
        definition={
            "mappings": {
                "dynamic": False,
                "fields": {
                    "text": {"type": "string"},
                    "title": {"type": "string"},
                    "section": {"type": "string"},
                    "project_id": {"type": "token"},
                    "service": {"type": "token"},
                    "source_type": {"type": "token"},
                    "owner": {"type": "token"},
                    "latest": {"type": "boolean"},
                    "date": {"type": "date"},
                },
            }
        },
    ),
]


def escape_credentials(uri: str) -> str:
    """Percent-encode the username and password so a password containing @ : / works as pasted."""
    scheme, sep, rest = uri.partition("://")
    userinfo, at, host = rest.rpartition("@")
    if not at:
        return uri
    user, colon, password = userinfo.partition(":")
    encode = lambda s: quote(unquote(s), safe="")  # unquote first: already-encoded values stay as they are
    return f"{scheme}{sep}{encode(user)}{colon}{encode(password)}@{host}"


@lru_cache
def db():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is not set; copy .env.example to .env and fill it in")
    return MongoClient(escape_credentials(uri))[os.getenv("MONGODB_DB", "tdd_assistant")]


def fs():
    return gridfs.GridFS(db())


def ensure_indexes(timeout: float = 180) -> None:
    """Create regular and Atlas Search indexes, then wait until the search indexes are queryable."""
    d = db()
    if "chunks" not in d.list_collection_names():
        d.create_collection("chunks")  # search indexes need an existing collection
    d.chunks.create_index([("project_id", 1), ("source_id", 1)])
    d.sources.create_index([("project_id", 1), ("key", 1), ("version", 1)], unique=True)
    d.investigations.create_index([("project_id", 1), ("created_at", -1)])
    d.findings.create_index("investigation_id")
    d.findings.create_index([("project_id", 1), ("category", 1), ("key", 1)])

    existing = {i["name"] for i in d.chunks.list_search_indexes()}
    missing = [m for m in SEARCH_INDEXES if m.document["name"] not in existing]
    if missing:
        d.chunks.create_search_indexes(missing)

    deadline = time.monotonic() + timeout
    while not all(i.get("queryable") for i in d.chunks.list_search_indexes()):
        if time.monotonic() > deadline:
            raise TimeoutError("Atlas Search indexes on 'chunks' did not become queryable in time")
        time.sleep(2)
