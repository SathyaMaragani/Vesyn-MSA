import type { ApiResult } from "@/types/api";
import { request } from "./http";

export const getHealth = (): Promise<ApiResult<{ status: string }>> =>
  request("/health", { timeoutMs: 3000 });
