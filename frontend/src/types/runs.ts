// Projects, runs and the final evidence package.
// Source: backend/api/routes_mas.py, backend/mas/graph.py, db/init/04_mas.sql.
import type { SearchBudget, Task } from "./events";
import type { TargetProfile, TargetResolution } from "./chemistry";
import type { RankedRoute } from "./routes";

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
export type ProjectStatus = "CREATED" | RunStatus;

export interface RunParams {
  top_n: number;
  iteration_limit: number;
}

export interface Verdict {
  passed: boolean;
  usable_route_ids: number[];
  reason: string;
}

export interface SearchAttempt extends SearchBudget {
  attempt: number;
  is_solved: boolean;
  solved_routes_found: number;
  search_time_seconds: number;
  verdict: Verdict;
}

/** RunRecord.result - the evaluator's `final` package (agents.py evaluator()). */
export interface RunResult {
  run_id: string;
  target: TargetResolution;
  profile: TargetProfile | null;
  verdict: Verdict;
  attempts: SearchAttempt[];
  /** null is a legitimate outcome: the evaluator may refuse to recommend. */
  recommended_route_id: number | null;
  recommended_route_db_id: string | null;
  recommendation: string;
  report: string;
  /** "template" or "llm:<provider>:<model>". */
  report_source: string;
  /** Absent on runs from before prompts, which were all retrosynthesis. */
  task?: Task;
  critic_notes: string | null;
  ranked_routes: RankedRoute[];
  limitations: string[];
  audit: string;
}

/** GET /api/runs/{id}. */
export interface RunRecord {
  id: string;
  project_id: string;
  status: RunStatus;
  params: RunParams;
  result: RunResult | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type RunSummary = Omit<RunRecord, "result">;

export interface Project {
  id: string;
  name: string;
  goal: string;
  target_query: string;
  target_smiles: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  /** Present on GET /api/projects/{id} only. */
  runs?: RunSummary[];
}

/** POST /api/projects body. */
export interface ProjectCreate {
  /** Plain words ("solubility of aspirin") or just a SMILES / name. */
  prompt?: string;
  /** A structure drawn in the editor; wins over any molecule named in the prompt. */
  smiles?: string;
  name?: string;
  goal?: string;
  top_n?: number;
  iteration_limit?: number;
  autostart?: boolean;
}

export interface ProjectCreated {
  project: Project;
  run: { id: string; project_id: string; status: RunStatus; params: RunParams } | null;
}
