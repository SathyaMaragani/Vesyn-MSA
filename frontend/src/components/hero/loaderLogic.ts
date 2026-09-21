// The loading sequence's rules, kept pure. A step is only ever "ok" or "failed"
// because a real check returned that; until then it is "pending". Nothing here
// invents a result or plays a canned success.

export type StepState = "pending" | "ok" | "failed";

export interface LoaderStep {
  id: "engine" | "environment" | "node" | "registry";
  label: string;
  state: StepState;
  /** Right-hand text, from the check itself ("READY", "7 REGISTERED", "OFFLINE"...). */
  detail: string;
}

export const MIN_SHOW_MS = 1900; // long enough to read, never longer than the checks + this
export const MAX_WAIT_MS = 7000; // a check that never answers is reported as such, not waited on forever

export const initialSteps = (): LoaderStep[] => [
  { id: "engine", label: "MOLECULAR ENGINE", state: "pending", detail: "" },
  { id: "environment", label: "SCIENTIFIC ENVIRONMENT", state: "pending", detail: "" },
  { id: "node", label: "RESEARCH NODE", state: "pending", detail: "" },
  { id: "registry", label: "AGENT REGISTRY", state: "pending", detail: "" },
];

/** 0..100: how many checks have answered. */
export function percentDone(steps: readonly LoaderStep[]): number {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((s) => s.state !== "pending").length / steps.length) * 100);
}

/**
 * When may the loader lift? When every check has answered and it has been shown
 * long enough to read - or when the wait limit is hit (pending checks are then
 * reported as "NO RESPONSE" rather than hidden).
 */
export function loaderVerdict(steps: readonly LoaderStep[], elapsedMs: number): { done: boolean; timedOut: boolean } {
  const allAnswered = steps.every((s) => s.state !== "pending");
  if (allAnswered && elapsedMs >= MIN_SHOW_MS) return { done: true, timedOut: false };
  if (elapsedMs >= MAX_WAIT_MS) return { done: true, timedOut: true };
  return { done: false, timedOut: false };
}

export function settleTimedOut(steps: readonly LoaderStep[]): LoaderStep[] {
  return steps.map((s) => (s.state === "pending" ? { ...s, state: "failed", detail: "NO RESPONSE" } : s));
}

/** The registry line: what the API actually returned. */
export function registryStep(result: { ok: true; ids: string[] } | { ok: false }): Pick<LoaderStep, "state" | "detail"> {
  if (!result.ok) return { state: "failed", detail: "API OFFLINE" };
  if (result.ids.length === 0) return { state: "ok", detail: "NONE REPORTED" };
  return { state: "ok", detail: `${result.ids.length} REGISTERED` };
}
