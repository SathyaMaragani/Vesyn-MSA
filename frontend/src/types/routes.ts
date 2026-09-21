// Route trees and the evaluator's ranked routes.
// Source of truth: backend/retrosynthesis/service.py (_molecule_node),
// validation.py, assessment.py, route_assessment.py and backend/mas/agents.py.
import type { AssessmentSummary, Severity } from "./events";
import type { EvidenceSummary, ReactionEvidence } from "./evidence";

export type ValidationStatus =
  | "MATCH"
  | "PARTIAL_MATCH"
  | "MISMATCH"
  | "MODEL_OUTPUT_INVALID"
  | "MODEL_UNAVAILABLE"
  | "VALIDATION_ERROR";

export interface StepValidation {
  status: ValidationStatus;
  interpretation?: string | null;
  /** e.g. "ReactionT5v2-forward-USPTO_MIT-..." - or "mock-t5-mock-v1" when the microservice runs without torch. */
  model?: string;
  predicted_products?: string[];
  inference_time_ms?: number;
  error?: string;
}

export interface StepAssessment {
  summary: AssessmentSummary | "STRONG_SUPPORT";
  flags?: string[];
  [extra: string]: unknown;
}

export interface RouteReaction {
  reactants: RouteNode[];
  reaction_smiles: string;
  template_used: number | null;
  template_hash: string | null;
  template_smarts: string | null;
  /** A LIBRARY COUNT - not a yield, not a probability. */
  template_occurrence: number | null;
  /** Expansion-policy probability. */
  score: number | null;
  classification: string | null;
  structural_validation?: StepValidation;
  forward_validation?: StepValidation;
  evidence?: ReactionEvidence;
  assessment?: StepAssessment;
}

export interface RouteNode {
  molecule_smiles: string;
  is_stock_available: boolean;
  reactions: RouteReaction[];
}

export interface RouteAssessment {
  summary: AssessmentSummary;
  label: string;
  critical_steps: { reaction_smiles: string; reason: string; flags: string[] }[];
  flags: string[];
}

export interface CritiqueIssue {
  step: number | null;
  product?: string;
  reaction_smiles?: string | null;
  severity: Severity;
  source: string;
  issue: string;
}

export interface Critique {
  route_id: number;
  issues: CritiqueIssue[];
  strengths: string[];
  counts: Partial<Record<Severity, number>>;
  headline: string;
}

export interface StartingMaterial {
  smiles: string;
  in_stock: boolean;
}

export interface ScoreBreakdown {
  assessment: number;
  structural: number;
  evidence: number;
  search: number;
  brevity: number;
}

/** One entry of RunResult.ranked_routes (mas.routes.route minus critique, plus critique). */
export interface RankedRoute {
  route_id: number;
  rank: number;
  db_id: string;
  attempt: number;
  number_of_reactions: number;
  state_score: number | null;
  /** Ranking heuristic. NOT a feasibility or yield probability (agents.py WEIGHTS). */
  score: number;
  score_breakdown: ScoreBreakdown;
  tree: RouteNode;
  assessment: RouteAssessment;
  critique: Critique;
  starting_materials: StartingMaterial[];
  evidence_summary: EvidenceSummary | null;
  signals: Record<string, unknown>;
}
