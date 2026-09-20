import os
from fastapi.testclient import TestClient
import pytest

from backend.api.main import app

client = TestClient(app)


def test_chat_with_valid_agents(monkeypatch):
    monkeypatch.setenv("NEOCHEMS_LLM", "none")
    for agent_id in ("planner", "research", "retro", "validator", "critic", "replanner", "evaluator"):
        r = client.post(f"/api/agents/{agent_id}/chat", json={"message": "What is your primary responsibility?"})
        assert r.status_code == 200, f"failed for {agent_id}: {r.text}"
        data = r.json()
        assert data["agent_id"] == agent_id
        assert "reply" in data
        assert len(data["reply"]) > 10
        assert data["source"] in ("llm", "expert_system")


def test_chat_with_invalid_agent():
    r = client.post("/api/agents/nonexistent_agent/chat", json={"message": "Hello"})
    assert r.status_code == 404
