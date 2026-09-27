"use client";

// CANDIDATE SYNTHESIS ROUTES, WHY THIS ROUTE? and EVIDENCE & PROVENANCE: the evaluator's package, read three ways.
//
// A route card is the route's spine drawn from its real SMILES (starting material first), the backend's verdict,
// and checks derived from its own fields. Its number is the ranking score - a heuristic over the signals, never a
// probability, and labelled so. "Why this route?" lists what the recommended route has going for it and each agent's
// actual verdict (agents do not vote). A run that recommends nothing says so, with the evaluator's own reason.
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Database, FileText, FlaskConical, Wrench } from "lucide-react";
import { MoleculeDrawing } from "@/components/chemistry/MoleculeSvg";
import { cx } from "@/components/ui/primitives";
import type { DashboardModel } from "@/lib/dashboard/model";
import type { EvidenceItem, RouteCard, WhyView } from "@/lib/dashboard/overview";
import { Card, CheckRow, StatusPill } from "./ui";

const ROLE = {
  recommended: { text: "Recommended", cls: "bg-nc-cyan text-nc-base border-nc-cyan" },
  alternative: { text: "Alternative", cls: "border-nc-line-strong text-nc-mid" },
  replanned: { text: "Replanned", cls: "border-nc-warn/60 text-nc-warn" },
} as const;

function Tile({ smiles, caption, inStock }: { smiles: string; caption: string; inStock: boolean | null }) {
  return (
    <figure className="m-0 flex w-[104px] shrink-0 flex-col items-center">
      <div className="flex h-[88px] w-[104px] items-center justify-center rounded-lg border border-nc-line bg-nc-base/70">
        <MoleculeDrawing smiles={smiles} width={100} height={84} bg="#161815" />
      </div>
      <figcaption className="mt-1.5 w-full truncate text-center text-[10px] text-nc-mid" title={smiles}>
        {caption}
        {inStock !== null && <span className={inStock ? "text-nc-ok" : "text-nc-warn"}>{inStock ? " · stock" : " · not stocked"}</span>}
      </figcaption>
    </figure>
  );
}

function RouteView({ r }: { r: RouteCard }) {
  const role = ROLE[r.role];
  return (
    <article className={cx("rounded-xl border p-3.5", r.role === "recommended" ? "nc-card-lit border-nc-cyan/70 bg-nc-cyan/[0.03]" : "border-nc-line bg-nc-base/30")}>
      <header className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-[19px] font-medium text-nc-hi">Route {r.routeId}</h3>
        <span className={cx("rounded-md border px-2 py-[1px] font-data text-[10.5px]", role.cls)}>{role.text}</span>
        <span className="ml-auto">
          <StatusPill tone={r.verdict.tone}>{r.verdict.label}</StatusPill>
        </span>
      </header>
      <div className="mt-1 font-data text-[11px] text-nc-lo">
        rank {r.rank} · {r.steps} step{r.steps === 1 ? "" : "s"} ·{" "}
        <span title="Ranking score: a heuristic over validation, evidence, search and brevity. Not a probability of success.">score {r.score.toFixed(2)}</span>
        {r.sources !== null && ` · ${r.sources} source${r.sources === 1 ? "" : "s"}`}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_236px]">
        <div className="flex items-start gap-1.5 overflow-x-auto pb-1">
          {r.chain.map((c, i) => (
            <React.Fragment key={`${c.smiles}-${i}`}>
              {i > 0 && <ArrowRight aria-hidden className="mt-9 h-4 w-4 shrink-0 text-nc-cyan/80" />}
              <Tile {...c} />
            </React.Fragment>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-3">
          <ul className="space-y-1.5">
            {r.checks.map((k) => (
              <CheckRow key={k.text} tone={k.tone} text={k.text} simulated={k.simulated} size="sm" />
            ))}
          </ul>
          <div className="flex gap-2">
            <Link href="/lab/routes" className="nc-btn">View route <ArrowRight className="h-3 w-3" aria-hidden /></Link>
            <Link href="/lab/evidence" className="nc-btn"><FileText className="h-3 w-3" aria-hidden /> View evidence</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CandidateRoutes({ m, routes }: { m: DashboardModel; routes: RouteCard[] }) {
  const [sort, setSort] = useState<"score" | "steps">("score");
  const [all, setAll] = useState(false);
  const sorted = useMemo(
    () => [...routes].sort((a, b) => (sort === "score" ? a.rank - b.rank : a.steps - b.steps || a.rank - b.rank)),
    [routes, sort],
  );
  const shown = all ? sorted : sorted.slice(0, 3);
  return (
    <Card
      title="Candidate synthesis routes"
      aside={
        routes.length > 0 && (
          <>
            <span className="nc-chip">{routes.length} route{routes.length === 1 ? "" : "s"}</span>
            <label className="flex items-center gap-1.5 rounded-md border border-nc-line-strong px-2 py-[3px] font-data text-[10.5px] text-nc-lo">
              Sort by:
              <select value={sort} onChange={(e) => setSort(e.target.value as "score" | "steps")} className="nc-focus bg-transparent text-nc-hi">
                <option value="score" className="bg-nc-base">Ranking score</option>
                <option value="steps" className="bg-nc-base">Fewest steps</option>
              </select>
            </label>
          </>
        )
      }
    >
      {routes.length === 0 ? (
        <p className="py-6 text-[12px] text-nc-lo">
          {!m.hasRun
            ? "No run selected."
            : m.stages.find((s) => s.id === "retro")?.state === "skipped"
              ? "Not a synthesis request, so no routes were planned."
              : m.phase === "running"
                ? "The evaluator has not ranked any routes yet."
                : "This run produced no routes."}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <RouteView key={`${r.attempt}-${r.routeId}`} r={r} />
          ))}
          {routes.length > 3 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="nc-btn w-full justify-center py-2">
              {all ? "Show the top 3" : `Show all ${routes.length} routes`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export function WhyThisRoute({ why, m, answer }: { why: WhyView | null; m: DashboardModel; answer: string | null }) {
  // Not a synthesis request (a profile, solubility...): there is no route to explain, but there is an answer.
  if (!why) {
    return (
      <Card title="Answer">
        <p className="text-[13px] leading-relaxed text-nc-hi">{answer ?? (m.phase === "running" ? "The evaluator has not answered yet." : "No run selected.")}</p>
      </Card>
    );
  }
  if (why.routeId === null) {
    return (
      <Card title="Why this route?" aside={<StatusPill tone="warn">None recommended</StatusPill>}>
        <p className="text-[13px] leading-relaxed text-nc-hi">{why.reason}</p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-nc-lo">
          Vesyn will not recommend a route while validation flags a step in every candidate. The best-scoring one is still listed, for review only.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Why this route?" aside={<span className="nc-chip border-nc-cyan/60 text-nc-cyan">Route {why.routeId} selected</span>}>
      <ul className="space-y-2">
        {why.checks.map((k) => (
          <CheckRow key={k.text} tone={k.tone} text={k.text} simulated={k.simulated} />
        ))}
      </ul>
      <div className="mt-4 rounded-lg border border-nc-line p-3">
        <div className="font-data text-[10px] uppercase tracking-[0.18em] text-nc-lo">Agent verdicts</div>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 2xl:grid-cols-2">
          {why.verdicts.map((v) => (
            <div key={v.agent} className="flex min-w-0 items-baseline justify-between gap-2 text-[11.5px]">
              <dt className="text-nc-lo">{v.agent}</dt>
              <dd className="truncate text-right" style={{ color: `rgb(var(--nc-${v.tone === "ok" ? "ok" : v.tone === "warn" ? "warn" : "bad"}))` }} title={v.verdict}>
                {v.verdict}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

const KIND_ICON = { stock: Database, experimental: BookOpen, similar_experimental: BookOpen, predicted: FlaskConical, unavailable: FileText } as const;

export function Provenance({ m, items }: { m: DashboardModel; items: EvidenceItem[] }) {
  const s = m.evidence.summary;
  const stats = [
    { Icon: BookOpen, value: s ? String(s.distinct_sources) : "—", label: "Sources" },
    { Icon: Wrench, value: m.hasRun ? String(m.evidence.toolCalls.total) : "—", label: "Tool calls" },
    { Icon: FlaskConical, value: s ? `${Math.round(s.evidence_coverage * 100)}%` : "—", label: "Coverage" },
  ];
  return (
    <Card title="Evidence & provenance">
      <div className="grid grid-cols-3 gap-2">
        {stats.map(({ Icon, value, label }) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-nc-line-strong">
              <Icon className="h-4 w-4 text-nc-cyan" aria-hidden />
            </span>
            <div>
              <div className="font-data text-[19px] leading-none text-nc-hi">{value}</div>
              <div className="mt-1 text-[10.5px] text-nc-lo">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 font-data text-[10px] uppercase tracking-[0.18em] text-nc-lo">Key evidence</div>
      {items.length === 0 ? (
        <p className="mt-2 text-[11.5px] text-nc-lo">No route evidence reported yet.</p>
      ) : (
        <ul className="mt-2 grid grid-cols-1 gap-2 2xl:grid-cols-2">
          {items.map((it) => {
            const Icon = KIND_ICON[it.kind];
            return (
              <li key={it.title} className="flex min-w-0 items-start gap-2.5 rounded-lg border border-nc-line p-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-nc-mid" aria-hidden />
                <div className="min-w-0">
                  <div className="truncate text-[11.5px] text-nc-hi" title={it.title}>{it.title}</div>
                  <div className="truncate text-[10.5px] text-nc-lo" title={it.detail}>{it.detail}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/lab/evidence" className="nc-btn mt-3 w-full justify-center py-2">
        Explore all evidence <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}
