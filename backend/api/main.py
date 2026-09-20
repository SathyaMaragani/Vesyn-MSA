"""Top-level FastAPI app.

Run:  uvicorn backend.api.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.api import (
    routes_conditions,
    routes_mas,
    routes_qsar,
    routes_retrosynthesis,
    routes_search,
)
from backend.mas import graph as mas_graph
from backend.mas import store as mas_store
from backend.mas import tools as mas_tools
from backend.molrepr import search as molsearch
from backend.qsar.service import QsarService
from backend.retrosynthesis.service import RetrosynthesisService

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ~8s: the ONNX expansion model plus the ZINC stock. Done once, at startup.
    logger.info("loading AiZynthFinder...")
    try:
        service = RetrosynthesisService()
        routes_retrosynthesis.set_service(service)
        logger.info("AiZynthFinder ready in %ss", service.load_time_seconds)
    except Exception as err:  # startup must not die silently; /health reports it
        routes_retrosynthesis.set_service(None, f"model failed to load: {err}")
        logger.exception("AiZynthFinder failed to load")

    # Small and fast (~1s) next to AiZynthFinder, but still loaded once, not per
    # request: the applicability index fingerprints the whole training set.
    try:
        qsar = QsarService()
        routes_qsar.set_service(qsar)
        logger.info("QSAR models ready in %ss", qsar.load_time_seconds)
    except Exception as err:
        routes_qsar.set_service(None, f"QSAR models failed to load: {err}")
        logger.exception("QSAR models failed to load")

    # The agent layer: tools get the loaded services; the schema is idempotent.
    mas_tools.bind(
        retro=routes_retrosynthesis._service, qsar=routes_qsar._service,
    )
    try:
        mas_store.ensure_schema()
        interrupted = mas_store.fail_interrupted_runs()
        if interrupted:
            logger.warning("marked %s interrupted run(s) as FAILED", interrupted)
    except Exception:
        logger.exception("NeoChems agent store unavailable - is Postgres up on :5434?")

    yield
    await mas_graph.cancel_all()
    molsearch.close_pool()


app = FastAPI(title="NeoChems", version="0.2.0", lifespan=lifespan)
# LOCAL DEV ONLY. This allows the Vite dev server to call the API from a
# different origin. Before ANY non-local deployment: replace the wildcard method
# and header lists with the specific ones used, drop any origin that is not the
# real frontend, and put the whole thing behind an env var so production never
# gets a localhost origin allow-listed. Credentials are off, so a stolen origin
# cannot ride the user's cookies - keep it that way unless auth is added.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_retrosynthesis.router)
app.include_router(routes_search.router)
app.include_router(routes_qsar.router)
app.include_router(routes_conditions.router)
app.include_router(routes_mas.router)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc: RequestValidationError):
    """Malformed body / out-of-range iteration_limit -> 400, not 422 + stack trace."""
    return JSONResponse(status_code=400, content={"detail": jsonable_encoder(exc.errors())})


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
