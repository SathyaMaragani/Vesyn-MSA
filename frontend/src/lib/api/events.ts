import type { ApiResult } from "@/types/api";
import { request } from "./http";

/**
 * Persisted events for a run - the authoritative history. Returned raw: callers
 * validate each one with parseEvent, exactly as they do for WebSocket frames.
 */
export const listEvents = (runId: string, after = 0, limit = 10000): Promise<ApiResult<unknown[]>> =>
  request(`/api/events?run_id=${encodeURIComponent(runId)}&after=${after}&limit=${limit}`, { timeoutMs: 15000 });
