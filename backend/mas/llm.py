"""LLM provider layer. Agents never import a vendor SDK.

Pick the provider with VESYN_LLM="<provider>:<model>":

    ollama:qwen3:14b              (default - local, no key)
    anthropic:claude-sonnet-5     needs ANTHROPIC_API_KEY
    openai:gpt-5                  needs OPENAI_API_KEY; OPENAI_BASE_URL points it
                                  at any OpenAI-compatible server (Gemini, vLLM...)
    none                          disables narration; runs stay fully functional

The LLM only writes prose (the critic's notes, the final report). It never
decides whether a molecule or reaction is valid - RDKit, ReactionT5 and the
literature index do that.
"""
from __future__ import annotations

import os

import httpx


class LLMUnavailable(RuntimeError):
    pass


def spec() -> str:
    return os.environ.get("VESYN_LLM", "ollama:qwen3:14b")


def generate(system: str, prompt: str, max_tokens: int = 700, timeout: float = 60.0) -> dict:
    # A missing server fails in 2 s (connect); `timeout` only bounds a slow local model writing.
    provider, _, model = spec().partition(":")
    if provider == "none":
        raise LLMUnavailable("LLM narration disabled (VESYN_LLM=none)")
    if provider not in _PROVIDERS:
        raise LLMUnavailable(f"unknown LLM provider {provider!r}")
    try:
        text = _PROVIDERS[provider](model, system, prompt, max_tokens,
                                   httpx.Timeout(timeout, connect=2.0))
    except httpx.HTTPError as err:
        raise LLMUnavailable(f"{provider} unreachable: {err}") from err
    return {"provider": provider, "model": model, "text": text.strip()}


def _anthropic(model: str, system: str, prompt: str, max_tokens: int,
               timeout: httpx.Timeout) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise LLMUnavailable("ANTHROPIC_API_KEY is not set")
    base = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
    r = httpx.post(
        f"{base}/v1/messages",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
        json={
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return "".join(b["text"] for b in r.json()["content"] if b["type"] == "text")


def _openai(model: str, system: str, prompt: str, max_tokens: int,
            timeout: httpx.Timeout) -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise LLMUnavailable("OPENAI_API_KEY is not set")
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    r = httpx.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "model": model,
            "max_completion_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"] or ""


def _ollama(model: str, system: str, prompt: str, max_tokens: int,
            timeout: httpx.Timeout) -> str:
    base = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
    if not base.startswith("http"):
        base = f"http://{base}"
    r = httpx.post(
        f"{base}/api/chat",
        json={
            "model": model,
            "stream": False,
            # qwen3 and friends otherwise spend the budget "thinking" out loud.
            "think": False,
            "options": {"num_predict": max_tokens},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["message"]["content"]


_PROVIDERS = {"anthropic": _anthropic, "openai": _openai, "ollama": _ollama}
