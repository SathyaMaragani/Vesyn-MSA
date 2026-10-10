"""HTTP API for the Technical Due Diligence Assistant."""
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from . import report
from .analysis import available_models, default_model, investigate, run_investigation
from .db import db, ensure_indexes, fs
from .ingest import ingest_file, slug
from .retrieval import hybrid_search

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_indexes()
    yield


app = FastAPI(title="Vesyn Evidence Engine", lifespan=lifespan)


def out(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = doc.pop("_id")
    doc.pop("embedding", None)
    return doc


def get_or_404(collection: str, id_: str) -> dict:
    doc = db()[collection].find_one({"_id": id_})
    if not doc:
        raise HTTPException(404, f"{collection[:-1]} {id_} not found")
    return doc


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    services: list[str] = Field(min_length=1)
    areas: list[Literal["scalability", "recurring_failures", "supply_safety"]] = [
        "scalability", "recurring_failures", "supply_safety"
    ]
    questions: list[str] = []


@app.post("/api/projects")
def create_project(body: ProjectIn):
    doc = {
        "_id": uuid4().hex[:12], "name": body.name.strip(),
        "services": [s.strip() for s in body.services if s.strip()],
        "scope": {"areas": body.areas, "questions": [q.strip() for q in body.questions if q.strip()]},
        "created_at": datetime.now(timezone.utc),
    }
    db().projects.insert_one(doc)
    return out(doc)


@app.get("/api/projects")
def list_projects():
    return [out(p) for p in db().projects.find().sort("created_at", -1)]


@app.post("/api/projects/{project_id}/sources")
def upload_sources(project_id: str, files: list[UploadFile], type: str = Form(""), service: str = Form(""),
                   date: str = Form(""), owner: str = Form("")):
    """Upload evidence. Form fields override front matter found in the files."""
    get_or_404("projects", project_id)
    results = []
    for f in files:
        data = f.file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"{f.filename} is larger than 20 MB")
        meta = {"type": type, "service": service, "date": date, "owner": owner}
        results.append(out(ingest_file(project_id, f.filename or "upload", data, meta)))
    return results


@app.get("/api/projects/{project_id}/sources")
def list_sources(project_id: str):
    """Every version of every source, newest version first, including failed uploads."""
    return [out(s) for s in db().sources.find({"project_id": project_id}).sort([("key", 1), ("version", -1)])]


@app.get("/api/sources/{source_id}/file")
def download_source(source_id: str):
    source = get_or_404("sources", source_id)
    ext = slug(source["filename"].rsplit(".", 1)[-1])  # slugged: the filename is user input
    return Response(
        fs().get(source_id).read(), media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{source["key"]}-v{source["version"]}.{ext}"'},
    )


@app.get("/api/projects/{project_id}/search")
def search(project_id: str, q: str, service: str = "", type: str = ""):
    """Retrieval check: passages with their source locations."""
    return [out(c) for c in hybrid_search(project_id, q, filters={"service": service, "source_type": type})]


@app.get("/api/models")
def list_models():
    """LLMs an investigation can run on: hosted providers with a key in .env, plus local Ollama models."""
    return {"default": default_model(), "models": available_models()}


class InvestigationIn(BaseModel):
    model: str | None = None  # "provider:model"; defaults to LLM_PROVIDER from .env


@app.post("/api/projects/{project_id}/investigations")
def start_investigation(project_id: str, body: InvestigationIn | None = None):
    get_or_404("projects", project_id)
    model = body.model if body else None
    if model and model not in available_models():
        raise HTTPException(422, f"model {model} is not available")
    return out(run_investigation(project_id, model))


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    model: str | None = None


@app.post("/api/projects/{project_id}/ask")
def ask(project_id: str, body: AskIn):
    """Answer one free-form question from the project's evidence. Nothing is stored."""
    project = get_or_404("projects", project_id)
    res = investigate(project, "question", body.question, [body.question], model_spec=body.model)
    return {**res, "findings": report.enrich(res["findings"])}


@app.get("/api/projects/{project_id}/investigations")
def list_investigations(project_id: str):
    return [out(i) for i in db().investigations.find({"project_id": project_id}, {"areas": 0}).sort("created_at", -1)]


def findings_of(investigation_id: str | None) -> list[dict]:
    return list(db().findings.find({"investigation_id": investigation_id})) if investigation_id else []


@app.get("/api/investigations/{investigation_id}/findings")
def list_findings(investigation_id: str):
    return [out(f) for f in findings_of(investigation_id)]


@app.get("/api/findings/{finding_id}")
def finding_detail(finding_id: str):
    """One finding with cited passages resolved, plus its history across investigations."""
    finding = report.enrich([get_or_404("findings", finding_id)])[0]
    history = db().findings.find(
        {"project_id": finding["project_id"], "category": finding["category"], "key": finding["key"]},
        {"evidence_status": 1, "severity": 1, "change_reason": 1, "created_at": 1, "investigation_id": 1},
    ).sort("created_at", 1)
    return {**out(finding), "history": [out(h) for h in history]}


@app.get("/api/investigations/{investigation_id}/compare")
def compare(investigation_id: str, against: str = ""):
    """Diff against another investigation (default: the one that preceded this one)."""
    inv = get_or_404("investigations", investigation_id)
    base = against or inv["previous_id"]
    if not base:
        raise HTTPException(404, "no previous investigation to compare with")
    diff = report.compare(findings_of(base), findings_of(investigation_id))
    return {"against": base, **{bucket: [out(f) for f in items] for bucket, items in diff.items()}}


@app.get("/api/investigations/{investigation_id}/brief", response_class=PlainTextResponse)
def brief(investigation_id: str):
    inv = get_or_404("investigations", investigation_id)
    findings = report.enrich(findings_of(investigation_id))
    diff = report.compare(findings_of(inv["previous_id"]), findings) if inv["previous_id"] else None
    return PlainTextResponse(
        report.brief(get_or_404("projects", inv["project_id"]), inv, findings, diff),
        media_type="text/markdown; charset=utf-8",
    )
