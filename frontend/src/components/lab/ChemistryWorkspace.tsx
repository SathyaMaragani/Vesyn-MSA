"use client";

import React from "react";
import { useRuntime } from "@/lib/runtime/RuntimeContext";

// The previous version of this file rendered a hardcoded paracetamol/ibuprofen
// result - invented yields, confidence scores and DOIs - regardless of what the
// backend said. It was deleted rather than adapted.
//
// Bind this to the real result package instead:
//   GET /api/runs/{id}          -> { ranked_routes, recommended_route_id,
//                                    recommendation, critiques, report }
//   GET /api/runs/{id}/routes   -> the persisted, ranked routes
//   GET /api/routes/{id}        -> one route with its per-step validation
//
// Rules that apply to every value rendered here:
//   - a field the backend did not return renders as "not reported", never as a
//     plausible-looking number;
//   - evidence keeps its level (DIRECT / SIMILAR / AI-PREDICTED / NO VERIFIED)
//     and its licence, and a similar precedent is never labelled as direct;
//   - the evaluator may recommend nothing, and that is a real state to render.

export function ChemistryWorkspace() {
  const { currentRun } = useRuntime();

  return (
    <div className="w-full h-full min-h-[620px] bg-[#FAF8F2] rounded-2xl overflow-hidden border border-[#E0DCCF] p-6 flex flex-col items-center justify-center text-[#0F0F0F] shadow-xs">
      <div className="w-14 h-14 rounded-xl bg-[#F0EDE0] border border-[#E0DCCF] flex items-center justify-center text-3xl mb-4">
        ⚗️
      </div>
      <h2 className="font-heading text-xl font-bold mb-2">Chemistry workspace</h2>
      <p className="font-mono text-xs text-[#5A564C] max-w-md text-center leading-relaxed">
        {currentRun.status === "IDLE"
          ? "No run yet."
          : `Run ${currentRun.id}: ${currentRun.status}.`}{" "}
        Routes, per-step validation and evidence render here once this component
        is bound to <span className="font-bold">GET /api/runs/&#123;id&#125;</span>.
      </p>
      <p className="font-mono text-[10px] text-[#8A8578] mt-3">
        see docs/FRONTEND-HANDOFF.md
      </p>
    </div>
  );
}
