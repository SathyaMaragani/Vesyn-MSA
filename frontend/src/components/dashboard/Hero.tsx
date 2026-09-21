"use client";

// CURRENT RESEARCH: the one thing on the page that is allowed to be big. The target at editorial scale on the left,
// the run's state under it, and the molecule with the whole right side to itself. Empty state: no run, no molecule,
// no invented figures.
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { getMolecule } from "@/lib/chem/molecule";
import type { DashboardModel } from "@/lib/dashboard/model";
import { useNeo } from "@/lib/store/NeoProvider";
import { MoleculeStage } from "./MoleculeStage";
import { Dot, NOT_REPORTED, TONE_COLOR, useTween } from "./ui";

/** C8H10N4O2 with its counts as subscripts, the way a chemist writes it. */
function Formula({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <sub key={i} className="text-[0.55em] leading-none">{part}</sub> : <React.Fragment key={i}>{part}</React.Fragment>))}
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="font-data text-[10px] uppercase tracking-[0.18em] text-nc-lo">{label}</div>
      <div className="mt-1 truncate font-data text-[13px] text-nc-hi">{children}</div>
    </div>
  );
}

export function Hero({ m }: { m: DashboardModel }) {
  const { health, launch, projects } = useNeo();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pct = useTween(m.progress.pct);
  const offline = health !== "online";

  // The headline is the compound's name when the backend resolved one. Otherwise it is the molecular formula, computed
  // from the SMILES the backend resolved (and labelled as such): a SMILES string is not a title.
  const formula = useMemo(() => {
    if (!m.target.smiles) return null;
    const r = getMolecule(m.target.smiles);
    return r.ok ? r.molecule.formula : null;
  }, [m.target.smiles]);
  const title = m.target.name ?? formula;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim() || busy || offline) return;
    setBusy(true);
    setError(null);
    const r = await launch(target);
    setBusy(false);
    if (r.status === "ok") setTarget("");
    else setError(r.message);
  }

  return (
    <section aria-label="Current research" className="relative isolate overflow-hidden border border-nc-line bg-nc-raised" style={{ minHeight: 520 }}>
      {/* the light the molecule sits in: a warm pool, a cool edge, and a hairline grid that stays out of the way */}
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "radial-gradient(52% 78% at 72% 46%, rgba(214,164,91,0.15), rgba(214,164,91,0) 64%), radial-gradient(40% 55% at 100% 100%, rgba(143,175,154,0.10), rgba(143,175,154,0) 70%)" }} />
      <div aria-hidden className="absolute inset-0 -z-10" style={{ opacity: 0.5, backgroundImage: "linear-gradient(rgba(84,84,73,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(84,84,73,0.22) 1px, transparent 1px)", backgroundSize: "56px 56px", maskImage: "radial-gradient(60% 90% at 72% 50%, #000, transparent 78%)", WebkitMaskImage: "radial-gradient(60% 90% at 72% 50%, #000, transparent 78%)" }} />

      {m.hasRun && m.target.smiles && <MoleculeStage smiles={m.target.smiles} className="absolute inset-y-0 right-0 w-[56%]" />}

      <div className="relative flex min-h-[520px] flex-col justify-between p-8">
        <div className="flex items-baseline gap-3">
          <span className="font-data text-[10px] tracking-[0.2em] text-nc-lo">01</span>
          <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.2em] text-nc-hi">Current research</h2>
        </div>

        {m.hasRun ? (
          <div className="max-w-[42%]">
            <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nc-lo">{m.target.name ? "Target" : formula ? "Target · formula from SMILES" : "Target"}</div>
            <div className="mt-2 font-light leading-[1.05] tracking-tight text-nc-hi" style={{ fontSize: title ? (m.target.name ? (title.length > 12 ? 44 : 64) : title.length > 9 ? 56 : 72) : 20, overflowWrap: m.target.name ? "anywhere" : "normal", whiteSpace: m.target.name ? "normal" : "nowrap" }}>
              {title ? (m.target.name ? title : <Formula text={title} />) : <span className="font-data text-[20px] tracking-[0.14em] text-nc-lo">{NOT_REPORTED}</span>}
            </div>
            {m.target.smiles && <div className="mt-3 truncate font-data text-[11px] text-nc-lo" title={m.target.smiles}>{m.target.smiles}</div>}
            {m.phase === "failed" && <p className="mt-4 max-w-md font-data text-[12px] leading-snug text-nc-bad">{m.alerts.find((a) => a.title === "RUN FAILED")?.detail ?? "the run failed"}</p>}
          </div>
        ) : (
          <div className="max-w-[46%]">
            <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nc-lo">{offline ? "API offline" : projects.state === "loading" ? "Loading" : "No active research run"}</div>
            <div className="mt-2 text-[52px] font-light leading-[1.02] tracking-tight text-nc-mid">{offline ? "The API is not answering." : projects.state === "loading" ? "…" : "Nothing is running."}</div>
            {!offline && projects.state !== "loading" && (
              <form onSubmit={start} className="mt-6 flex max-w-md items-center gap-2">
                <input value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} placeholder="SMILES or compound name" aria-label="Start a new run: target molecule" className="nc-focus h-10 min-w-0 flex-1 border border-nc-line-strong bg-nc-base/70 px-3 font-data text-[12px] text-nc-hi placeholder:text-nc-lo" />
                <button type="submit" disabled={busy || !target.trim()} className="nc-focus flex h-10 items-center gap-2 border border-nc-cyan/70 bg-nc-cyan/10 px-4 font-data text-[11px] uppercase tracking-[0.16em] text-nc-cyan hover:bg-nc-cyan/20 disabled:cursor-not-allowed disabled:border-nc-line disabled:bg-transparent disabled:text-nc-lo">
                  <Play className="h-3 w-3" aria-hidden /> {busy ? "Starting" : "Start new run"}
                </button>
              </form>
            )}
            {error && <div role="alert" className="mt-2 font-data text-[11px] text-nc-bad">{error}</div>}
          </div>
        )}

        <div className="max-w-[42%]">
          {/* progress: the share of workflow stages that have reported completion (the backend reports no percentage) */}
          {m.hasRun && (
          <div aria-label="Progress" className="flex items-end gap-5">
            <div className="flex items-baseline gap-1 font-data font-light leading-none tabular-nums text-nc-hi">
              {pct === null ? <span className="text-[16px] tracking-[0.14em] text-nc-lo">{NOT_REPORTED}</span> : <><span className="text-[76px]">{Math.round(pct)}</span><span className="text-[26px] text-nc-lo">%</span></>}
            </div>
            <div className="mb-1.5 min-w-0 flex-1">
              <div className="h-px w-full bg-nc-line-strong">
                <div className="h-px transition-[width] duration-700" style={{ width: `${pct ?? 0}%`, background: m.phase === "failed" ? "rgb(var(--nc-bad))" : "rgb(var(--nc-cyan))" }} />
              </div>
              <div className="mt-2 font-data text-[10px] leading-snug tracking-[0.04em] text-nc-lo">
                {m.progress.pct === null ? "no run selected" : `${m.progress.done} of ${m.progress.total} workflow stages have reported completion`}
              </div>
            </div>
          </div>
          )}

          <div className={m.hasRun ? "mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-nc-line pt-4" : "grid grid-cols-2 gap-x-6 gap-y-4 border-t border-nc-line pt-4"}>
            <Meta label="Project">{m.projectName ?? (m.hasRun ? NOT_REPORTED : "—")}</Meta>
            <Meta label="Run"><span title={m.runId ?? undefined}>{m.runId ? m.runId.replace(/^run_/, "RUN-").toUpperCase() : "—"}</span></Meta>
            <Meta label="Status">
              <span className="inline-flex items-center gap-2" style={{ color: TONE_COLOR[m.statusTone] }}>
                <Dot tone={m.statusTone} pulse={m.statusWord === "ACTIVE"} /> {m.statusWord}
              </span>
            </Meta>
            <Meta label="Current agent">
              {m.currentAgent ? (
                <span className="inline-flex items-center gap-2" style={{ color: TONE_COLOR.run }} title={`${m.currentAgent.name} · ${m.currentAgent.activity}`}>
                  <Dot tone="run" pulse /> {m.currentAgent.name.replace(/ Agent$/, "").toUpperCase()}
                </span>
              ) : m.hasRun ? (
                <span className="text-nc-lo">{m.phase === "completed" || m.phase === "failed" ? "none · run ended" : "none active"}</span>
              ) : (
                "—"
              )}
            </Meta>
          </div>
        </div>
      </div>

      {m.hasRun && m.target.smiles && (
        <>
          <Link href="/lab/chemistry" className="nc-focus absolute right-5 top-4 flex items-center gap-1.5 font-data text-[10px] uppercase tracking-[0.16em] text-nc-lo hover:text-nc-hi">
            Inspect the molecule <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
          <div className="pointer-events-none absolute bottom-3 right-5 max-w-[40%] text-right font-data text-[9px] leading-snug text-nc-lo/80">
            Atoms and bonds are the graph the SMILES denotes; positions are a layout, not a computed conformer. Drag to turn it.
          </div>
        </>
      )}
    </section>
  );
}
