"""Load the synthetic demo project.

python -m app.seed           # create the project and ingest demo_data/initial
python -m app.seed --later   # also ingest demo_data/later (the repeat batch report)
python -m app.seed --reset   # first delete the demo project's evidence, investigations and findings
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

from .db import db, ensure_indexes, fs
from .ingest import ingest_file

DATA = Path(__file__).resolve().parents[1] / "demo_data"
PROJECT = {
    "_id": "gefitinibdemo",
    "name": "Gefitinib route review (synthetic demo)",
    "services": ["gefitinib", "erlotinib"],
    "scope": {
        "areas": ["scalability", "recurring_failures", "supply_safety"],
        "questions": ["Can this route run at 10 kg scale?"],
    },
}


def load(project_id: str, folder: str) -> list[dict]:
    return [ingest_file(project_id, p.name, p.read_bytes()) for p in sorted((DATA / folder).iterdir())]


def wipe(project_id: str) -> None:
    """Delete a project's sources, stored originals, chunks, investigations and findings."""
    d = db()
    for s in d.sources.find({"project_id": project_id}, {"_id": 1}):
        fs().delete(s["_id"])
    for name in ("sources", "chunks", "investigations", "findings"):
        d[name].delete_many({"project_id": project_id})


if __name__ == "__main__":
    ensure_indexes()
    if "--reset" in sys.argv:
        wipe(PROJECT["_id"])
    if not db().projects.find_one({"_id": PROJECT["_id"]}):
        db().projects.insert_one({**PROJECT, "created_at": datetime.now(timezone.utc)})
    for folder in ["initial"] + (["later"] if "--later" in sys.argv else []):
        for s in load(PROJECT["_id"], folder):
            print(f"{s['status']:>7}  v{s['version']}  {s['chunk_count']:>2} chunks  {s['filename']}  {s['error'] or ''}")
