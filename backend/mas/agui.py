"""AG-UI adapter: NeoChems domain events -> AG-UI protocol events.

Any AG-UI client (CopilotKit, OpenBot-style UIs) can drive a run with
POST /agui and render it: steps for agent tasks, tool calls for gateway calls,
text messages for agent-to-agent messages. Every domain event is also passed
through verbatim as a CUSTOM event, so the 3D office loses nothing by speaking
AG-UI instead of the raw WebSocket.
"""
from __future__ import annotations

import json


def _msg(message_id: str, text: str) -> list[dict]:
    return [
        {"type": "TEXT_MESSAGE_START", "messageId": message_id, "role": "assistant"},
        {"type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": text},
        {"type": "TEXT_MESSAGE_END", "messageId": message_id},
    ]


def _tool_call(d: dict, input_: dict) -> list[dict]:
    return [
        {"type": "TOOL_CALL_START", "toolCallId": d["call_id"], "toolCallName": d["tool"]},
        {"type": "TOOL_CALL_ARGS", "toolCallId": d["call_id"], "delta": json.dumps(input_)},
        {"type": "TOOL_CALL_END", "toolCallId": d["call_id"]},
    ]


def _tool_result(d: dict, content: dict) -> dict:
    return {
        "type": "TOOL_CALL_RESULT", "messageId": f"msg_{d['call_id']}",
        "toolCallId": d["call_id"], "role": "tool", "content": json.dumps(content),
    }


def to_agui(event: dict) -> list[dict]:
    kind, d = event["type"], event["data"]
    out: list[dict] = []
    if kind == "TASK_STARTED":
        out.append({"type": "STEP_STARTED", "stepName": f"{event['agent_id']}:{event['task_id']}"})
    elif kind in ("TASK_COMPLETED", "TASK_FAILED"):
        out.append({"type": "STEP_FINISHED", "stepName": f"{event['agent_id']}:{event['task_id']}"})
    elif kind == "TOOL_STARTED":
        out += _tool_call(d, d.get("input", {}))
    elif kind == "TOOL_COMPLETED":
        out.append(_tool_result(d, d.get("summary", {})))
    elif kind == "TOOL_FAILED":
        if d.get("status") == "DENIED":  # refused before it started: open the call first
            out += _tool_call(d, {})
        out.append(_tool_result(d, {"error": d.get("error"), "status": d.get("status")}))
    elif kind == "MESSAGE_SENT":
        out += _msg(event["id"], f"[{event['agent_id']} -> {d['to']}] {d['text']}")
    out.append({"type": "CUSTOM", "name": kind, "value": event})
    return out


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"
