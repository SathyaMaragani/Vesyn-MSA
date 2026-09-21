import type { ApiResult } from "@/types/api";
import type { GraphDescription, ToolInfo } from "@/types/audit";
import { request } from "./http";

export const listTools = (): Promise<ApiResult<ToolInfo[]>> => request("/api/tools");
export const getGraph = (): Promise<ApiResult<GraphDescription>> => request("/api/graph");
