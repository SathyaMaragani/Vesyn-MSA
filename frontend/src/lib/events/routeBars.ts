// Routes of the latest search attempt, as the lab's route rack shows them. Real
// routes only: ROUTE_GENERATED creates a bar, VALIDATION_COMPLETED colours it.
import type { AssessmentSummary } from "../../types/events.ts";
import type { RunView } from "./fold.ts";

export interface RouteBarData {
  key: string;
  routeId: number;
  steps: number;
  /** null until the validator has reported on this route. */
  assessment: AssessmentSummary | null;
}

export function routeBars(run: RunView): RouteBarData[] {
  return run.routeOrder
    .map((k) => run.routes[k])
    .filter((r) => r !== undefined && r.attempt === run.latestAttempt)
    .map((r) => ({
      key: r.key,
      routeId: r.routeId,
      steps: r.steps ?? 1,
      assessment: r.validation?.assessment ?? null,
    }));
}
