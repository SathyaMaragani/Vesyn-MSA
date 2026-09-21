import type { ApiResult } from "@/types/api";
import type { AuditCall, AuditEntry } from "@/types/audit";
import { request } from "./http";

export const listAudit = (runId: string, limit = 500): Promise<ApiResult<AuditEntry[]>> =>
  request(`/api/audit?run_id=${encodeURIComponent(runId)}&limit=${limit}`);

export const getAuditCall = (callId: string): Promise<ApiResult<AuditCall>> =>
  request(`/api/audit/${encodeURIComponent(callId)}`);
