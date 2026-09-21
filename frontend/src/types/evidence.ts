// Evidence. Source of truth: backend/conditions/schema.py. The backend strips
// absent fields (_drop_none), so nearly everything is optional - and a missing
// field must render as "not reported", never as a default.

export type EvidenceLevel = "experimental" | "similar_experimental" | "predicted" | "unavailable";

export interface Provenance {
  source_type: string;
  source_id: string;
  dataset_name?: string;
  dataset_version?: string;
  title?: string;
  authors?: string[];
  journal?: string;
  year?: number;
  /** May be the dataset curator's DOI, NOT the experiment's paper (see schema.py). */
  doi?: string;
  patent_number?: string;
  example_number?: string;
  url?: string;
  url_origin?: string;
  reaction_identifier?: string;
  source_text_reference?: string;
  retrieved_at?: string;
  license?: string;
}

export interface Precedent {
  reaction_id?: string;
  reaction_smiles?: string;
  provenance?: Provenance;
  similarity?: number;
  transformation_similarity?: number;
  substrate_similarity?: number;
  combined_similarity?: number;
  match_type?: string;
  conditions?: Record<string, unknown>;
}

export interface ReactionEvidence {
  evidence_level: EvidenceLevel;
  conditions?: Record<string, unknown>;
  direct_precedents?: Precedent[];
  similar_precedents?: Precedent[];
  precedent_count?: number;
  provider?: string;
  provider_version?: string;
  dataset_version?: string;
  retrieved_at?: string;
  cached?: boolean;
  reason?: string;
}

/** backend/retrosynthesis/service.py _evidence_summary. */
export interface EvidenceSummary {
  steps: number;
  steps_with_experimental_evidence: number;
  steps_with_similar_evidence: number;
  steps_predicted: number;
  steps_without_evidence: number;
  evidence_coverage: number;
  distinct_sources: number;
}
