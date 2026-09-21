import type { ApiResult } from "@/types/api";
import type { RunRecord } from "@/types/runs";
import { request } from "./http";

export const getRun = (id: string): Promise<ApiResult<RunRecord>> =>
  request(`/api/runs/${encodeURIComponent(id)}`);
