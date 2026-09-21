"use client";

import React from "react";
import { StateNotice } from "@/components/ui/primitives";
import { useNeo } from "@/lib/store/NeoProvider";

/** Every workspace starts here: offline and no-run are handled once, honestly. */
export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { health, runId, runRecord } = useNeo();
  if (health === "offline") {
    return <StateNotice kind="offline" detail="Nothing is shown until the backend responds. No data is simulated." />;
  }
  if (!runId) {
    return <StateNotice kind="empty" title="No run selected" detail="Pick a project in the top bar, or launch a run with a SMILES or compound name." />;
  }
  if (runRecord.state === "error") return <StateNotice kind="error" detail={runRecord.message} />;
  return <>{children}</>;
}

export function InProgress({ what }: { what: string }) {
  return <StateNotice kind="loading" title="Run in progress" detail={`${what} appears when the evaluator finishes this run.`} />;
}
