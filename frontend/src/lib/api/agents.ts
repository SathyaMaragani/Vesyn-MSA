import type { AgentSnapshot } from "@/types/agents";
import type { ApiResult } from "@/types/api";
import { request } from "./http";

export const listAgents = (): Promise<ApiResult<AgentSnapshot[]>> => request("/api/agents");

/** POST /api/agents/{id}/chat - what the backend answers a question with. */
export interface AgentReply {
  agent_id: string;
  name: string;
  reply: string;
  /** "llm" when a model wrote it, "expert_system" when the LLM was unavailable and the agent described itself */
  source: "llm" | "expert_system";
  model: string | null;
}

/**
 * Asks one agent a question. With a run id the backend grounds the answer in that run's own recent
 * events for that agent, which is how a follow-up ("why was that route rejected?") stays about the run
 * on screen instead of becoming general chemistry chat.
 *
 * Generous timeout: the reply is one LLM call, and on a local model that is tens of seconds.
 */
export const askAgent = async (agentId: string, message: string, runId?: string | null): Promise<ApiResult<AgentReply>> => {
  const result = await request<AgentReply>(`/api/agents/${encodeURIComponent(agentId)}/chat`, {
    method: "POST",
    body: { message, run_id: runId ?? undefined },
    timeoutMs: 90_000,
  });
  if (result.status === "ok" && (!result.data || typeof result.data.reply !== "string" || typeof result.data.name !== "string")) {
    return { status: "error", code: 502, message: "The research service returned an unreadable reply. Please try again." };
  }
  return result;
};
