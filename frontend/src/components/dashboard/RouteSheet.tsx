"use client";

// ROUTE PREVIEW: the displayed route as a specimen sheet: warm paper, dark slides. The structures are the REAL
// precursors and target of the route's first step, drawn from their SMILES; the verdict, the step score and the
// stock check are the backend's. Before the evaluator has reported there is no route tree, and the sheet says so
// instead of drawing one.
import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MoleculeDrawing } from "@/components/chemistry/MoleculeSvg";
import type { DashboardModel } from "@/lib/dashboard/model";

const PAPER = "#e8e4d8";
const INK = "#1a1b18";
const FAINT = "#6d6a5c";
const RULE = "#b9b5a4";
const TONE: Record<string, string> = { ok: "#4d6f5a", warn: "#a9772e", bad: "#a5503a", run: "#4d6f5a", idle: FAINT, dim: FAINT };

function Slide({ smiles, w, h, caption, mark }: { smiles: string; w: number; h: number; caption: string; mark?: string }) {
  return (
    <figure className="m-0 shrink-0">
      <div className="relative" style={{ width: w, height: h, background: "#141512", boxShadow: "0 1px 0 rgba(0,0,0,.25), 0 8px 18px -10px rgba(0,0,0,.5)" }}>
        <MoleculeDrawing smiles={smiles} width={w} height={h} bg="#141512" />
      </div>
      <figcaption className="mt-1.5 font-data text-[9px] uppercase tracking-[0.14em]" style={{ color: FAINT }}>
        {caption}
        {mark && <span style={{ color: mark === "in stock" ? "#4d6f5a" : "#a9772e" }}> · {mark}</span>}
      </figcaption>
    </figure>
  );
}

export function RouteSheet({ m }: { m: DashboardModel }) {
  const r = m.route;
  return (
    <section aria-label="Route preview" className="relative" style={{ background: PAPER, color: INK }}>
      {/* paper edge and a fine grain so it reads as a sheet, not a light panel */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(26,27,24,0.05) 1px, transparent 1px)", backgroundSize: "100% 28px", opacity: 0.6 }} />
      <div className="relative p-6">
        <div className="flex items-baseline gap-3 border-b pb-2.5" style={{ borderColor: RULE }}>
          <span className="font-data text-[10px] tracking-[0.18em]" style={{ color: FAINT }}>07</span>
          <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.2em]">Route preview</h2>
          {r && (
            <span className="ml-auto font-data text-[10px] uppercase tracking-[0.14em]" style={{ color: TONE[r.verdictTone] }}>
              route {r.routeId} · rank {r.rank}{r.recommended ? " · recommended" : ""}
            </span>
          )}
        </div>

        {r ? (
          <>
            <div className="mt-5 flex items-center gap-4">
              <div className="flex flex-col gap-3">
                {r.precursors.map((p) => (
                  <Slide key={p.smiles} smiles={p.smiles} w={132} h={82} caption={p.furtherSteps > 0 ? `precursor · +${p.furtherSteps} step${p.furtherSteps === 1 ? "" : "s"}` : "precursor"} mark={p.inStock ? "in stock" : "not in stock"} />
                ))}
              </div>

              <div className="flex min-w-[96px] flex-1 flex-col items-center px-1 text-center">
                <div className="font-data text-[9px] uppercase tracking-[0.16em]" style={{ color: FAINT }}>reaction</div>
                <div className="my-1 flex w-full items-center">
                  <div className="h-px flex-1" style={{ background: INK }} />
                  <ArrowRight className="-ml-1 h-4 w-4" style={{ color: INK }} aria-hidden />
                </div>
                <div className="font-data text-[10px] tracking-[0.06em]" style={{ color: INK }}>{r.reactionClass ?? "class not reported"}</div>
                <div className="font-data text-[9px]" style={{ color: FAINT }}>{r.reactionScore !== null ? `policy score ${r.reactionScore.toFixed(2)}` : "score not reported"}</div>
              </div>

              <Slide smiles={r.target} w={168} h={132} caption="target · product" />
            </div>

            <div className="mt-5 flex items-end justify-between gap-4 border-t pt-3" style={{ borderColor: RULE }}>
              <div>
                <div className="font-data text-[9px] uppercase tracking-[0.16em]" style={{ color: FAINT }}>Validator verdict</div>
                <div className="mt-0.5 font-data text-[12px] uppercase tracking-[0.1em]" style={{ color: TONE[r.verdictTone] }}>{r.verdict}</div>
                <div className="mt-1 font-data text-[10px]" style={{ color: FAINT }}>
                  {r.steps} step{r.steps === 1 ? "" : "s"}{r.moreSteps > 0 ? ` · first step shown, ${r.moreSteps} more in the full route` : ""}
                </div>
              </div>
              <Link href="/lab/routes" className="nc-focus flex items-center gap-2 border px-3.5 py-2 font-data text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-[#1a1b18] hover:text-[#e8e4d8]" style={{ borderColor: INK }}>
                View full route <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex min-h-[250px] flex-col justify-center">
            <div className="font-data text-[10px] uppercase tracking-[0.18em]" style={{ color: FAINT }}>{m.hasRun ? "No route tree yet" : "No run"}</div>
            <p className="mt-2 max-w-sm text-[15px] leading-snug" style={{ color: INK }}>
              {!m.hasRun
                ? "A route appears here once a run has produced one."
                : m.phase === "failed"
                  ? "The run ended without a route. Nothing is drawn in its place."
                  : m.candidates
                    ? `${m.candidates} candidate route${m.candidates === 1 ? "" : "s"} exist. The route tree is reported by the evaluator when the run completes.`
                    : "No candidate route has been generated yet."}
            </p>
            <Link href="/lab/routes" className="nc-focus mt-5 inline-flex w-fit items-center gap-2 border px-3.5 py-2 font-data text-[10px] uppercase tracking-[0.16em] hover:bg-[#1a1b18] hover:text-[#e8e4d8]" style={{ borderColor: INK }}>
              View routes <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
