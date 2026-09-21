import type { ApiResult } from "@/types/api";
import type { Project, ProjectCreate, ProjectCreated, RunSummary } from "@/types/runs";
import { request } from "./http";

export const listProjects = (limit = 50): Promise<ApiResult<Project[]>> =>
  request(`/api/projects?limit=${limit}`);

export const getProject = (id: string): Promise<ApiResult<Project>> =>
  request(`/api/projects/${encodeURIComponent(id)}`);

/** Launches the real agent team. Returns the project and its run. */
export const createProject = (body: ProjectCreate): Promise<ApiResult<ProjectCreated>> =>
  request("/api/projects", { method: "POST", body, timeoutMs: 15000 });

export type { RunSummary };
