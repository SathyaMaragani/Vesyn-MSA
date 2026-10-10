// The overview's panels, as pure functions of real state - the same rule as model.ts: nothing is invented.
//
// Where the design called for a figure the backend does not produce, the panel shows the nearest real one
// under its own name: a route's ranking score (never a "confidence"), the drug's measured properties and its
// ChEMBL approval (never a therapeutic class), each agent's actual verdict (agents do not vote).
import type { AgentView } from "../events/agentViews.ts";
import type { Tone } from "../events/activity.ts";
import type { RunView } from "../events/fold.ts";
import type { NeoEvent } from "../../types/events.ts";
import type { EvidenceLevel, Precedent, Provenance } from "../../types/evidence.ts";
import type { RankedRoute, RouteNode } from "../../types/routes.ts";
import type { RunResult } from "../../types/runs.ts";
import type { AgentRow } from "./model.ts";

export type CheckTone = "ok" | "warn" | "bad";
export interface Check {
  tone: CheckTone;
  text: string;
  /** the check rests on a seeded demo record, not a measurement */
  simulated?: boolean;
}

export interface ChainMolecule {
  smiles: string;
  caption: string;
  /** starting materials only: present in the purchasable-stock file */
  inStock: boolean | null;
}

export interface RouteCard {
  routeId: number;
  rank: number;
  attempt: number;
  steps: number;
  /** agents.py score(): a ranking heuristic over the signals, NOT a probability */
  score: number;
  sources: number | null;
  role: "recommended" | "alternative" | "replanned";
  verdict: { label: string; tone: CheckTone };
  /** the main branch, starting material first, target last */
  chain: ChainMolecule[];
  checks: Check[];
  /** a recalled lesson marked a step of this route */
  memoryFlagged: boolean;
}

export interface Verdict {
  agent: string;
  verdict: string;
  tone: CheckTone;
}

export interface WhyView {
  /** null: the evaluator refused to recommend - `reason` says why */
  routeId: number | null;
  reason: string;
  checks: Check[];
  verdicts: Verdict[];
}

export interface TimelineItem {
  seq: number;
  /** mm:ss since the run started */
  at: string;
  who: string;
  text: string;
  tone: CheckTone;
}

export interface AgentDetail {
  id: string;
  name: string;
  role: string | null;
  current: string | null;
  completed: string[];
  tools: string[];
  lastAction: string | null;
  status: string;
  tone: Tone;
}

export interface TargetFacts {
  formula: string | null;
  mw: number | null;
  tags: { label: string; title: string }[];
}

// --- routes ---------------------------------------------------------------------------------------------------------------

const depth = (n: RouteNode): number =>
  n.reactions.length ? 1 + Math.max(...n.reactions[0].reactants.map(depth)) : 0;

/** The route's spine: from the target, always into the precursor with the most steps behind it (ties: the larger
 *  molecule, which carries the skeleton). Side reagents are real but are not the story of the route. */
export function mainChain(root: RouteNode): RouteNode[] {
  const chain = [root];
  let n = root;
  while (n.reactions.length && n.reactions[0].reactants.length) {
    n = n.reactions[0].reactants.reduce((a, b) => {
      const da = depth(a);
      const db = depth(b);
      return db > da || (db === da && b.molecule_smiles.length > a.molecule_smiles.length) ? b : a;
    });
    chain.push(n);
  }
  return chain.reverse();
}

const VERDICT: Record<string, { label: string; tone: CheckTone }> = {
  STRONGLY_SUPPORTED: { label: "Validated", tone: "ok" },
  SUPPORTED: { label: "Validated", tone: "ok" },
  INSUFFICIENT_EVIDENCE: { label: "Unconfirmed", tone: "warn" },
  REVIEW_REQUIRED: { label: "Review required", tone: "bad" },
};

function routeChecks(r: RankedRoute): Check[] {
  const checks: Check[] = [];
  const missing = r.starting_materials.filter((m) => !m.in_stock).length;
  checks.push(
    missing === 0
      ? { tone: "ok", text: `Starting materials in stock (${r.starting_materials.length})` }
      : { tone: "bad", text: `${missing} starting material${missing === 1 ? "" : "s"} not in stock` },
  );

  const s = r.assessment.summary;
  if (s === "REVIEW_REQUIRED") {
    const at = r.critique.issues.find((i) => i.severity === "high" && i.source !== "memory" && i.source !== "documents" && i.step !== null);
    checks.push({ tone: "bad", text: at ? `Validation flagged step ${at.step}` : "Validation flagged a step" });
  } else if (s === "INSUFFICIENT_EVIDENCE") checks.push({ tone: "warn", text: "Not enough evidence to confirm" });
  else checks.push({ tone: "ok", text: "No step flagged by validation" });

  const e = r.evidence_summary;
  const withPrecedent = e ? e.steps_with_experimental_evidence + e.steps_with_similar_evidence : 0;
  checks.push(
    !e
      ? { tone: "warn", text: "Literature precedent not reported" }
      : withPrecedent === 0
        ? { tone: "warn", text: "No literature precedent" }
        : { tone: "ok", text: `Precedent for ${withPrecedent} of ${e.steps} steps` },
  );

  const high = r.critique.issues.filter((i) => i.severity === "high" && i.source !== "memory" && i.source !== "documents").length;
  const medium = r.critique.counts.medium ?? 0;
  checks.push(
    high > 0
      ? { tone: "bad", text: `${high} critical issue${high === 1 ? "" : "s"}` }
      : medium > 0
        ? { tone: "warn", text: `Minor warnings (${medium})` }
        : { tone: "ok", text: "No critical warnings" },
  );

  const lessons = r.critique.issues.filter((i) => i.source === "memory");
  if (lessons.length) {
    checks.push({
      tone: "bad",
      text: `Reuses a transformation flagged in an earlier investigation`,
      simulated: lessons.every((i) => i.simulated === true),
    });
  }
  // a finding from the lab's own documents (the RAG engine) that is still unresolved for one of this route's steps
  if (r.critique.issues.some((i) => i.source === "documents")) {
    checks.push({ tone: "bad", text: "Lab documents report an unresolved problem with a step" });
  }
  return checks;
}

export function routeCards(result: RunResult | null, targetName: string | null): RouteCard[] {
  if (!result) return [];
  return result.ranked_routes.map((r) => {
    const chain = mainChain(r.tree);
    return {
      routeId: r.route_id,
      rank: r.rank,
      attempt: r.attempt,
      steps: r.number_of_reactions,
      score: r.score,
      sources: r.evidence_summary?.distinct_sources ?? null,
      role: result.recommended_route_id === r.route_id ? "recommended" : r.attempt > 1 ? "replanned" : "alternative",
      verdict: VERDICT[r.assessment.summary] ?? { label: r.assessment.label, tone: "warn" },
      chain: chain.map((n, i) => ({
        smiles: n.molecule_smiles,
        caption: i === chain.length - 1 ? (targetName ?? "Target") : i === 0 ? "Starting material" : `Intermediate ${i}`,
        inStock: i === 0 ? n.is_stock_available : null,
      })),
      checks: routeChecks(r),
      memoryFlagged: r.critique.issues.some((i) => i.source === "memory"),
    };
  });
}

// --- why this route --------------------------------------------------------------------------------------------------------

function stepSignals(r: RankedRoute): { steps: number; structural: number; forward: number } {
  let steps = 0;
  let structural = 0;
  let forward = 0;
  const walk = (n: RouteNode) => {
    for (const rx of n.reactions) {
      steps++;
      if (rx.structural_validation?.status === "MATCH") structural++;
      if (rx.forward_validation?.status === "MATCH") forward++;
      rx.reactants.forEach(walk);
    }
  };
  walk(r.tree);
  return { steps, structural, forward };
}

export function whyRoute(result: RunResult | null, cards: RouteCard[]): WhyView | null {
  // runs from before prompts carry no task, and were all retrosynthesis
  if (!result || (result.task !== undefined && result.task !== "retrosynthesis")) return null;
  const rec = result.ranked_routes.find((r) => r.route_id === result.recommended_route_id);
  const card = cards.find((c) => c.role === "recommended");
  if (!rec || !card) return { routeId: null, reason: result.recommendation, checks: [], verdicts: [] };

  const sig = stepSignals(rec);
  const shortest = Math.min(...cards.map((c) => c.steps));
  const demoted = cards.filter((c) => c.memoryFlagged && c.routeId !== rec.route_id);
  const demotedSimulated = demoted.length > 0 && demoted.every((c) => c.checks.some((k) => k.simulated));

  const checks: Check[] = [
    card.checks[0],
    { tone: sig.structural === sig.steps ? "ok" : "warn", text: `RDKit template check passes on ${sig.structural} of ${sig.steps} steps` },
    { tone: sig.forward === sig.steps ? "ok" : "warn", text: `ReactionT5 reproduces the product on ${sig.forward} of ${sig.steps} steps` },
    rec.evidence_summary
      ? { tone: "ok", text: `${rec.evidence_summary.distinct_sources} literature source${rec.evidence_summary.distinct_sources === 1 ? "" : "s"}` }
      : { tone: "warn", text: "Literature sources not reported" },
    card.steps === shortest
      ? { tone: "ok", text: `Shortest candidate (${card.steps} step${card.steps === 1 ? "" : "s"})` }
      : { tone: "warn", text: `${card.steps} steps (shortest candidate: ${shortest})` },
    card.checks[3],
  ];
  if (card.memoryFlagged) checks.push({ tone: "bad", text: "Reuses a transformation flagged in an earlier investigation" });
  else if (demoted.length) {
    checks.push({
      tone: "ok",
      text: `Avoids a transformation flagged in an earlier investigation (${demoted.length} route${demoted.length === 1 ? "" : "s"} ranked down)`,
      simulated: demotedSimulated,
    });
  }

  const highs = rec.critique.issues.filter((i) => i.severity === "high" && i.source !== "memory" && i.source !== "documents").length;
  const profile = result.profile;
  const profiled = !!profile && Object.values(profile).every((v) => v && !("error" in (v as object)));
  const replans = result.attempts.length - 1;
  const verdicts: Verdict[] = [
    { agent: "Research", verdict: profiled ? "Target profiled" : "Profile incomplete", tone: profiled ? "ok" : "warn" },
    { agent: "Retrosynthesis", verdict: `Proposed (attempt ${rec.attempt})`, tone: "ok" },
    { agent: "Validation", verdict: card.verdict.label, tone: card.verdict.tone },
    { agent: "Critic", verdict: highs ? `${highs} critical issue${highs === 1 ? "" : "s"}` : "No critical issues", tone: highs ? "bad" : "ok" },
    { agent: "Replanner", verdict: replans > 0 ? `Replanned ${replans}×` : "Not needed", tone: replans > 0 ? "warn" : "ok" },
    { agent: "Evaluator", verdict: "Selected as best route", tone: "ok" },
  ];
  if (result.memory) {
    verdicts.push({ agent: "Memory", verdict: `${result.memory.recalled} recalled · ${result.memory.applied.length} applied`, tone: "ok" });
  }
  return { routeId: rec.route_id, reason: result.recommendation, checks, verdicts };
}

// --- timeline --------------------------------------------------------------------------------------------------------------

const since = (t0: number, ts: string): string => {
  const s = Math.max(0, Math.round((new Date(ts).getTime() - t0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** One line per decision, in order: what each agent concluded, not every step it took.
 *
 *  The critic's event counts every high-severity issue, and a recalled lesson is one - so while only the events are
 *  known the line says "high-severity flags". Once the evaluator's package arrives it separates what the tools found
 *  from what earlier investigations flagged, the same split the route cards make. */
export function timeline(run: RunView, result: RunResult | null = null): TimelineItem[] {
  const evs = run.events;
  if (!evs.length) return [];
  const t0 = new Date((evs.find((e) => e.type === "RUN_STARTED") ?? evs[0]).ts).getTime();
  const items: TimelineItem[] = [];
  const add = (ev: NeoEvent, who: string, text: string, tone: CheckTone = "ok") =>
    items.push({ seq: ev.seq, at: since(t0, ev.ts), who, text, tone });
  let critiques = 0;
  let criticalIssues = 0;

  for (const ev of evs) {
    switch (ev.type) {
      case "MOLECULE_RECEIVED":
        add(ev, "Orchestrator", `Resolved ${ev.data.name ?? "the target"}${ev.data.task ? ` · ${ev.data.task}` : ""}`);
        break;
      case "MEMORY_RECALLED":
        if (ev.data.error) add(ev, "Memory", "Memory unreachable - continuing without it", "warn");
        else add(ev, "Memory", `Recalled ${ev.data.count} earlier finding${ev.data.count === 1 ? "" : "s"}, ${ev.data.lessons} lesson${ev.data.lessons === 1 ? "" : "s"}`);
        break;
      case "TASK_COMPLETED": {
        const out = ev.data.output ?? {};
        if (ev.agent_id === "research") add(ev, "Research", "Profiled the target");
        else if (ev.agent_id === "retro" && typeof out.routes === "number") add(ev, "Retrosynthesis", `Generated ${out.routes} route${out.routes === 1 ? "" : "s"}`);
        else if (ev.agent_id === "validator" && typeof out.reason === "string") add(ev, "Validation", out.reason, out.passed ? "ok" : "bad");
        else if (ev.agent_id === "critic") {
          const issues = result?.ranked_routes.flatMap((r) => r.critique.issues) ?? null;
          const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
          const routes = `Critiqued ${plural(critiques, "route")}`;
          if (issues) {
            const tools = issues.filter((i) => i.severity === "high" && i.source !== "memory" && i.source !== "documents").length;
            const lessons = issues.filter((i) => i.source === "memory").length;
            const found = tools ? plural(tools, "critical issue") : "no critical issues";
            add(ev, "Critic", `${routes}: ${found}${lessons ? `, ${plural(lessons, "step")} flagged by earlier investigations` : ""}`, tools || lessons ? "warn" : "ok");
          } else add(ev, "Critic", `${routes}, ${plural(criticalIssues, "high-severity flag")}`, criticalIssues ? "warn" : "ok");
        }
        break;
      }
      case "CRITIQUE_CREATED":
        critiques++;
        criticalIssues += ev.data.counts.high ?? 0;
        break;
      case "REPLAN_STARTED":
        add(ev, "Replanner", `Widened the search: ${ev.data.reason}`, "warn");
        break;
      case "MEMORY_RETAINED":
        if (ev.data.error) add(ev, "Memory", "Could not retain this run", "warn");
        else add(ev, "Memory", `Retained ${ev.data.retained} finding${ev.data.retained === 1 ? "" : "s"} for future runs`);
        break;
      case "PROJECT_COMPLETED":
        add(ev, "Evaluator", ev.data.recommendation, ev.data.recommended_route_id === null && (ev.data.task ?? "retrosynthesis") === "retrosynthesis" ? "warn" : "ok");
        break;
      case "PROJECT_FAILED":
        add(ev, "Run", ev.data.error, "bad");
        break;
    }
  }
  return items;
}

// --- agent details -----------------------------------------------------------------------------------------------------------

export function agentDetail(id: string, run: RunView, agents: readonly AgentView[], rows: readonly AgentRow[]): AgentDetail | null {
  const a = agents.find((x) => x.id === id);
  const row = rows.find((x) => x.id === id);
  if (!a || !row) return null;
  const tasks = run.taskOrder.map((t) => run.tasks[t]).filter((t) => t && t.agentId === id);
  const tools = [...new Set(run.callOrder.map((c) => run.calls[c]).filter((c) => c && c.agentId === id).map((c) => c.tool))];
  return {
    id,
    name: row.name,
    role: a.role,
    current: a.currentTask?.title ?? null,
    completed: tasks.filter((t) => t.status === "COMPLETED").map((t) => t.title),
    tools,
    lastAction: row.lastEvent?.text ?? null,
    status: row.status,
    tone: row.tone,
  };
}

// --- target ------------------------------------------------------------------------------------------------------------------

export function targetFacts(result: RunResult | null): TargetFacts {
  const p = result?.profile?.properties;
  const props = p && !("error" in p) ? p : null;
  const an = result?.profile?.analogues;
  const hits = an && !("error" in an) ? an.hits : [];
  const tags: TargetFacts["tags"] = [];
  if (props) {
    tags.push({ label: `logP ${props.logp.toFixed(2)}`, title: "Crippen logP, computed by RDKit" });
    tags.push({ label: `TPSA ${props.tpsa.toFixed(1)}`, title: "Topological polar surface area (Å²), computed by RDKit" });
    tags.push(
      props.lipinski_violations === 0
        ? { label: "Lipinski ✓", title: "No Lipinski rule-of-five violations" }
        : { label: `${props.lipinski_violations} Lipinski violation${props.lipinski_violations === 1 ? "" : "s"}`, title: "Lipinski rule-of-five" },
    );
  }
  if (hits.length) {
    const best = hits[0];
    tags.push(
      best.tanimoto >= 0.999
        ? { label: "Approved drug (ChEMBL)", title: `Identical to ChEMBL approved molecule ${best.molecule_id}` }
        : { label: `Nearest approved drug · ${best.tanimoto.toFixed(2)}`, title: `Morgan-fingerprint Tanimoto to ChEMBL approved molecule ${best.molecule_id}` },
    );
  }
  return { formula: props?.formula ?? null, mw: props?.molecular_weight ?? null, tags };
}

// --- evidence & provenance ---------------------------------------------------------------------------------------------------

export interface EvidenceItem {
  title: string;
  detail: string;
  kind: "stock" | EvidenceLevel;
}

const LEVEL: Record<EvidenceLevel, string> = {
  experimental: "Direct precedent",
  similar_experimental: "Similar precedent",
  predicted: "Predicted conditions",
  unavailable: "No precedent in the index",
};

/** Where a precedent came from, in the fewest words that still let someone find it. */
function provenanceLabel(p: Provenance | undefined): string | null {
  if (!p) return null;
  if (p.patent_number) return `USPTO ${p.patent_number}${p.year ? ` (${p.year})` : ""}`;
  if (p.title) return `${p.title}${p.year ? ` (${p.year})` : ""}`;
  if (p.dataset_name) return `${p.dataset_name}${p.reaction_identifier ? ` · ${p.reaction_identifier}` : ""}`;
  return p.source_type || null;
}

/** The displayed route's evidence: its starting materials' stock, then each step's best precedent and its source. */
export function keyEvidence(route: RankedRoute | null, limit = 4): EvidenceItem[] {
  if (!route) return [];
  const sm = route.starting_materials;
  const items: EvidenceItem[] = [
    { title: `Starting materials (${sm.length})`, detail: `${sm.filter((m) => m.in_stock).length} of ${sm.length} in the ZINC purchasable stock`, kind: "stock" },
  ];
  let step = 0;
  const walk = (n: RouteNode) => {
    for (const rx of n.reactions) {
      step++;
      const ev = rx.evidence;
      if (ev) {
        const best: Precedent | undefined = ev.direct_precedents?.[0] ?? ev.similar_precedents?.[0];
        items.push({ title: `Step ${step} · ${LEVEL[ev.evidence_level]}`, detail: provenanceLabel(best?.provenance) ?? ev.reason ?? "no source reported", kind: ev.evidence_level });
      }
      rx.reactants.forEach(walk);
    }
  };
  walk(route.tree);
  return items.slice(0, limit);
}
