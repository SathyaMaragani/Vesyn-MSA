// Where each piece of information came from: which tool, which agent, when, and
// whether it actually ran. A source that was never called is reported as such -
// never implied to have been consulted.
import type { RunView, ToolCallView } from "./fold.ts";

export interface SourceDef {
  tool: string;
  what: string;
}

/** The governed tools that produce information (docs/ARCHITECTURE.md; GET /api/tools). */
export const SOURCES: readonly SourceDef[] = [
  { tool: "pubchem.resolve", what: "Name to structure (PubChem)" },
  { tool: "rdkit.represent", what: "Descriptors (RDKit)" },
  { tool: "chembl.similarity", what: "Nearest approved drugs (ChEMBL)" },
  { tool: "qsar.solubility", what: "Solubility prediction (QSAR model)" },
  { tool: "aizynthfinder.plan", what: "Route search (AiZynthFinder, USPTO templates)" },
  { tool: "rdkit.template_validation", what: "Structural check of each step (RDKit)" },
  { tool: "reactiont5.forward_validation", what: "Independent forward prediction (ReactionT5)" },
  { tool: "ord.evidence", what: "Literature precedent (ORD / USPTO index)" },
  { tool: "llm.generate", what: "Prose only: critic notes and report" },
];

export type SourceStatus = "not_called" | "running" | "ok" | "partial" | "failed";

export interface ProvenanceRow extends SourceDef {
  status: SourceStatus;
  calls: ToolCallView[];
  agents: string[];
  versions: string[];
  /** ISO time of the first call */
  firstAt: string | null;
  totalMs: number;
}

export function provenanceRows(run: RunView): ProvenanceRow[] {
  const all = run.callOrder.map((id) => run.calls[id]).filter((c): c is ToolCallView => !!c);
  return SOURCES.map((s) => {
    const calls = all.filter((c) => c.tool === s.tool);
    const bad = calls.filter((c) => c.status === "FAILED" || c.status === "DENIED").length;
    const good = calls.filter((c) => c.status === "COMPLETED").length;
    const open = calls.filter((c) => c.status === "REQUESTED" || c.status === "RUNNING").length;
    const status: SourceStatus = calls.length === 0 ? "not_called" : open > 0 && bad === 0 ? "running" : bad > 0 && good > 0 ? "partial" : bad > 0 ? "failed" : "ok";
    return {
      ...s,
      status,
      calls,
      agents: [...new Set(calls.map((c) => c.agentId).filter((a): a is string => !!a))],
      versions: [...new Set(calls.map((c) => c.version).filter((v): v is string => !!v))],
      firstAt: calls[0]?.requestedAt ?? null,
      totalMs: calls.reduce((n, c) => n + (c.durationMs ?? 0), 0),
    };
  });
}
