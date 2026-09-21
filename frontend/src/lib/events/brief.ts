// The "situation brief": what the system has actually determined, in the fields a
// chemist asks for. Every value comes from the folded events or the run's final
// package; where neither says, the value is null and the UI shows NOT REPORTED.
// No hidden reasoning is exposed - only observable state and stated conclusions.
import type { RunResult } from "../../types/runs.ts";
import type { Tone } from "./activity.ts";
import type { RunView } from "./fold.ts";

export interface BriefItem {
  key: string;
  label: string;
  /** null = not reported */
  value: string | null;
  tone: Tone;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildBrief(input: {
  run: RunView;
  result: RunResult | null;
  /** the project's own goal text, if the backend stored one */
  goal: string | null;
  /** display name of the agent doing something right now, if any */
  activeAgent: string | null;
}): BriefItem[] {
  const { run, result, goal, activeAgent } = input;
  const items: BriefItem[] = [];
  const target = run.target?.matched_name ?? run.target?.canonical_smiles ?? result?.target.matched_name ?? run.query;

  items.push({
    key: "objective",
    label: "Current objective",
    value: target ? `${goal ? `${goal} — ` : ""}target ${target}` : null,
    tone: "idle",
  });

  const ended = run.phase === "completed" || run.phase === "failed";
  items.push({
    key: "agent",
    label: "Current agent",
    value: activeAgent ?? (run.runId ? (ended ? "none — the run has ended" : run.events.length ? "none active right now" : null) : null),
    tone: activeAgent ? "run" : "dim",
  });

  const latest = run.routeOrder.map((k) => run.routes[k]).filter((r) => r.attempt === run.latestAttempt);
  const top = result?.ranked_routes[0] ?? null;
  items.push({
    key: "route",
    label: "Current route",
    value: top
      ? `route ${top.route_id} ranked #${top.rank} of ${result?.ranked_routes.length}, ${plural(top.number_of_reactions, "step")}`
      : latest.length
        ? `${plural(latest.length, "candidate")} in attempt ${run.latestAttempt}`
        : run.runId
          ? "none generated yet"
          : null,
    tone: "idle",
  });

  const judged = latest.filter((r) => r.validation);
  const count = (a: string) => judged.filter((r) => r.validation?.assessment === a).length;
  items.push({
    key: "validation",
    label: "Validation status",
    value: latest.length
      ? judged.length
        ? `${count("REVIEW_REQUIRED")} review required · ${count("INSUFFICIENT_EVIDENCE")} insufficient evidence · ${count("SUPPORTED") + count("STRONGLY_SUPPORTED")} supported (of ${latest.length})`
        : "awaiting validation"
      : null,
    tone: count("REVIEW_REQUIRED") > 0 ? "bad" : judged.length ? "ok" : "dim",
  });

  const worst = top?.critique.issues.find((i) => i.severity === "high") ?? top?.critique.issues.find((i) => i.severity === "medium") ?? null;
  const failedCall = run.callOrder.map((id) => run.calls[id]).find((c) => c && (c.status === "FAILED" || c.status === "DENIED"));
  items.push({
    key: "issue",
    label: "Key issue",
    value: worst
      ? `${worst.issue}${worst.step ? ` (step ${worst.step})` : ""}`
      : run.error
        ? run.error
        : failedCall
          ? `${failedCall.tool} ${failedCall.status === "DENIED" ? "denied" : "failed"}: ${failedCall.error ?? "no detail"}`
          : null,
    tone: worst || run.error || failedCall ? "bad" : "dim",
  });

  const others = Math.max(0, (result?.ranked_routes.length ?? latest.length) - 1);
  items.push({
    key: "alternatives",
    label: "Alternative routes",
    value: run.runId ? `${plural(others, "other candidate")} · ${plural(run.replans.length, "replan")}` : null,
    tone: run.replans.length ? "warn" : "idle",
  });

  items.push({
    key: "uncertainty",
    label: "Confidence / uncertainty",
    value: run.runId
      ? `The backend produces no probability or confidence score. ${result?.limitations[0] ?? ""}`.trim()
      : null,
    tone: "warn",
  });

  const ev = top?.evidence_summary ?? null;
  items.push({
    key: "evidence",
    label: "Evidence",
    value: ev
      ? `${ev.steps_with_experimental_evidence} direct · ${ev.steps_with_similar_evidence} similar · ${ev.steps_without_evidence} none, of ${plural(ev.steps, "step")}`
      : null,
    tone: ev && ev.steps_with_experimental_evidence === 0 ? "warn" : "idle",
  });

  items.push({
    key: "final",
    label: "Final evaluation",
    value: result?.recommendation ?? run.outcome?.recommendation ?? (run.runId ? (ended ? null : "pending — run in progress") : null),
    tone: (result?.recommended_route_id ?? run.outcome?.recommendedRouteId) === null ? "warn" : "ok",
  });

  return items;
}
