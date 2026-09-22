// Target molecule and profile. Source: backend/mas/tools.py (_represent,
// _similar, _solubility) and backend/molrepr/resolve.py.

export interface TargetResolution {
  query: string;
  canonical_smiles: string;
  /** "smiles" when the input was already a structure, "pubchem" when looked up by name. */
  source: "smiles" | "chembl" | "pubchem";
  matched_name: string | null;
}

/** rdkit.represent output. */
export interface MolecularProperties {
  canonical_smiles: string;
  inchikey: string;
  formula: string;
  molecular_weight: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatable_bonds: number;
  rings: number;
  heavy_atoms: number;
  stereocentres: number;
  lipinski_violations: number;
}

export interface AnalogueHit {
  molecule_id: number | string;
  smiles: string;
  tanimoto: number;
}

/** qsar.solubility output - only the fields the UI relies on are typed. */
export interface SolubilityPrediction {
  predicted_value: number;
  units: string;
  [extra: string]: unknown;
}

/** Each research item is the tool output, or {error} when that tool failed. */
type Tool<T> = T | { error: string };

export interface TargetProfile {
  properties?: Tool<MolecularProperties>;
  solubility?: Tool<SolubilityPrediction>;
  analogues?: Tool<{ library: string; hits: AnalogueHit[] }>;
}
