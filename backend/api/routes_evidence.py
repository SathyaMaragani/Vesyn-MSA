"""Document evidence over the API: governed calls to the evidence service (MongoDB Atlas).

Each call goes through the tool gateway as principal "user", so it is policy-checked and
lands in the audit log like an agent's call would.
"""
from __future__ import annotations

import hmac

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.mas import evidence, gateway

router = APIRouter(tags=["evidence"])


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


def _require_key(request: Request) -> None:
    """Uploads, reviews and questions change data or spend model quota, so they need the access key."""
    key = evidence.access_key()
    sent = request.headers.get("x-vesyn-key", "")
    if key and not hmac.compare_digest(sent.encode(), key.encode()):
        raise HTTPException(status_code=401, detail="Access key missing or wrong. Enter it on the Documents page.")


async def _call(tool: str, args: dict) -> dict:
    try:
        return await gateway.call(tool, args, agent_id="user", reason="Direct API request")
    except gateway.PolicyError as err:
        raise HTTPException(status_code=403, detail=str(err)) from err
    except evidence.EvidenceUnavailable as err:
        raise HTTPException(status_code=503, detail=str(err)) from err


@router.api_route("/api/evidence/app/{path:path}", methods=["GET", "POST"])
async def app_data(path: str, request: Request) -> Response:
    """Pass-through for the Documents screens: the web app reaches the evidence service through
    this API, so only one address is public. GET and POST only; uploads are forwarded as sent."""
    if request.method == "POST":
        _require_key(request)
    base = evidence.url()
    if base == "none":
        raise HTTPException(status_code=503, detail="document evidence disabled")
    headers = {"content-type": request.headers["content-type"]} if "content-type" in request.headers else {}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(900.0, connect=5.0)) as client:
            r = await client.request(request.method, f"{base}/api/{path}", params=request.query_params,
                                     content=await request.body(), headers=headers)
    except httpx.HTTPError as err:
        raise HTTPException(status_code=503, detail=f"evidence service unreachable: {err}") from err
    passed = {k: r.headers[k] for k in ("content-type", "content-disposition") if k in r.headers}
    return Response(content=r.content, status_code=r.status_code, headers=passed)


@router.get("/api/evidence/search")
async def search(q: str, compound: str = "", type: str = "") -> dict:
    return await _call("evidence.search", {"query": q, "compound": compound, "type": type})


@router.post("/api/evidence/ask")
async def ask(body: AskRequest, request: Request) -> dict:
    _require_key(request)
    return await _call("evidence.ask", {"question": body.question})
