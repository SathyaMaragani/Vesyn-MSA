import type { AgentSnapshot } from "@/types/agents";
import type { ApiResult } from "@/types/api";
import { request } from "./http";

export const listAgents = (): Promise<ApiResult<AgentSnapshot[]>> => request("/api/agents");
