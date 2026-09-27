"use client";

// TARGET MOLECULE: what the run is about. The name the backend resolved (or the formula computed from its SMILES),
// the formula and weight RDKit computed, and tags that are all measured or looked up: logP, TPSA, Lipinski, and
// whether ChEMBL lists it as an approved drug. The structure turns in 3D or lies flat in 2D, both drawn from the real
// SMILES. The four figures underneath are the evaluator's, and read "—" until it has reported them.
import React, { useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { MoleculeDrawing } from "@/components/chemistry/MoleculeSvg";
import { cx } from "@/components/ui/primitives";
import { getMolecule } from "@/lib/chem/molecule";
import type { DashboardModel } from "@/lib/dashboard/model";
import type { RouteCard, TargetFacts } from "@/lib/dashboard/overview";
import { useNeo } from "@/lib/store/NeoProvider";
import { MoleculeStage } from "./MoleculeStage";
import { Card, NOT_REPORTED } from "./ui";

/** C9H8O4 with its counts as subscripts, the way a chemist writes it. */
export function Formula({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <sub key={i} className="text-[0.62em]">{part}</sub> : <React.Fragment key={i}>{part}</React.Fragment>))}
    </>
  );
}

function Stat({ value, label }: { value: string | null; label: string }) {
  return (
    <div className="min-w-0 px-4 first:pl-0">
      <div className={cx("font-data text-[26px] font-medium leading-none tabular-nums", value === null ? "text-nc-lo" : "text-nc-cyan")} title={value === null ? "not reported yet" : undefined}>
        {value ?? "—"}
      </div>
      <div className="mt-2 text-[11.5px] text-nc-mid">{label}</div>
    </div>
  );
}

export function TargetCard({ m, facts, routes }: { m: DashboardModel; facts: TargetFacts; routes: RouteCard[] }) {
  const { demo, run } = useNeo();
  const [view, setView] = useState<"3d" | "2d">("3d");
  const stage = useRef<HTMLDivElement>(null);

  // No resolved name: the headline is the formula computed from the SMILES, labelled as such. A SMILES is not a title.
  const computed = useMemo(() => {
    if (!m.target.smiles) return null;
    const r = getMolecule(m.target.smiles);
    return r.ok ? r.molecule.formula : null;
  }, [m.target.smiles]);
  const formula = facts.formula ?? computed;
  const title = m.target.name;

  const s = m.evidence.summary;
  const validated = routes.filter((r) => r.verdict.tone === "ok").length;

  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          Target molecule
          {demo ? <span className="nc-chip border-nc-warn/60 text-nc-warn">SIMULATED</span> : run.task && <span className="nc-chip text-nc-cyan">{run.task.toUpperCase()}</span>}
        </span>
      }
      aside={
        m.target.smiles && (
          <>
            <div role="group" aria-label="Structure view" className="flex overflow-hidden rounded-md border border-nc-line-strong">
              {(["3d", "2d"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cx("nc-focus px-2.5 py-1 font-data text-[10.5px] uppercase", view === v ? "bg-nc-cyan/15 text-nc-cyan" : "text-nc-lo hover:text-nc-mid")}>
                  {v}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void stage.current?.requestFullscreen?.()} className="nc-btn px-1.5" aria-label="Show the structure full screen">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        )
      }
    >
      <div className="grid min-h-[240px] grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-2">
        <div className="min-w-0 pt-1">
          {m.hasRun ? (
            <>
              <div className="break-words text-[40px] font-semibold leading-[1.05] tracking-tight text-nc-hi">
                {title ?? (formula ? <Formula text={formula} /> : <span className="font-data text-[15px] tracking-[0.14em] text-nc-lo">{NOT_REPORTED}</span>)}
              </div>
              {m.target.smiles && <div className="mt-2 truncate font-data text-[11px] text-nc-lo" title={m.target.smiles}>{m.target.smiles}</div>}
              {formula && (
                <div className="mt-4 font-data text-[20px] text-nc-hi">
                  <Formula text={formula} />
                  {!title && <span className="ml-2 align-middle font-data text-[9.5px] uppercase tracking-[0.14em] text-nc-lo">from SMILES</span>}
                </div>
              )}
              <div className="mt-1 font-data text-[14px] text-nc-mid">
                MW <span className="ml-2 text-nc-hi">{facts.mw !== null ? `${facts.mw.toFixed(2)} g/mol` : "—"}</span>
              </div>
              {facts.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {facts.tags.map((t) => (
                    <span key={t.label} className="nc-chip" title={t.title}>{t.label}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pt-6">
              <div className="text-[28px] font-light leading-tight text-nc-mid">Nothing is running.</div>
              <p className="mt-3 max-w-xs text-[12px] text-nc-lo">Ask for a synthesis above, or open the Search tab to draw a structure.</p>
            </div>
          )}
        </div>

        <div ref={stage} className="relative min-h-[240px] overflow-hidden rounded-xl bg-nc-base/40">
          {/* a warm pool of light for the molecule to sit in */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(55% 60% at 50% 50%, rgb(var(--nc-cyan) / 0.14), transparent 70%)" }} />
          {m.target.smiles &&
            (view === "3d" ? (
              <MoleculeStage smiles={m.target.smiles} className="absolute inset-0" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <MoleculeDrawing smiles={m.target.smiles} width={300} height={220} bg="#121210" />
              </div>
            ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 divide-x divide-nc-line border-t border-nc-line pt-4">
        <Stat value={m.hasRun && routes.length ? String(routes.length) : m.candidates !== null ? String(m.candidates) : null} label="Candidate routes" />
        <Stat value={routes.length ? String(validated) : null} label="Validated routes" />
        <Stat value={s ? String(s.distinct_sources) : null} label="Literature sources" />
        <Stat value={s ? `${Math.round(s.evidence_coverage * 100)}%` : null} label="Evidence coverage" />
      </div>
    </Card>
  );
}
