"use client";

import { useMemo } from "react";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import { buildFacilityState, type FacilityState } from "./facilityState";

/** The facility's derived state: the same fold the world renders, for the interface that annotates it. */
export function useFacilityState(): FacilityState {
  const { agents, run } = useNeo();
  const result = useRunResult();
  return useMemo(() => buildFacilityState({ agents, run, result }), [agents, run, result]);
}
