"use client";

// THE ROUTES, stacked. One card per candidate, the recommended one lit and first.
//
// Routes are named by their chemistry - how many steps, from what starting material - and never by a
// letter: AiZynthFinder numbers routes per run, so two runs of the same molecule return the same routes
// under different numbers. The id is shown small, for anyone cross-checking the laptop app.
import React, { useState } from "react";
import { ArrowUp, Brain } from "lucide-react";
import { MoleculeSvg } from "@/components/chemistry/MoleculeSvg";
import { cx } from "@/components/ui/primitives";
import type { DashboardModel } from "@/lib/dashboard/model";
import type { RouteCard, WhyView } from "@/lib/dashboard/overview";
import { lessonOf } from "@/lib/mobile/assistant";
import { CheckRow, Sheet, SimBadge, StatusPill, TONE_COLOR } from "./ui";

type Open = { kind: "route" | "why"; routeId: number } | { kind: "decision" } | null;

const ROLE: Record<RouteCard["role"], { text: string; tone: "run" | "dim" | "warn" }> = {
  recommended: { text: "Recommended", tone: "run" },
  alternative: { text: "Alternative", tone: "dim" },
  replanned: { text: "From a widened search", tone: "warn" },
};

/** The route's spine, target at the top, drawn down the screen the way a phone reads. */
function Chain({ card }: { card: RouteCard }) {
  const steps = [...card.chain].reverse(); // target first
  return (
    <ol className="space-y-1">
      {steps.map((mol, i) => (
        <li key={`${mol.smiles}-${i}`}>
          {i > 0 && (
            <div className="flex items-center gap-2 py-1 pl-1">
              <ArrowUp className="h-3.5 w-3.5 text-nc-cyan" aria-hidden />
              <span className="font-data text-[10px] uppercase tracking-[0.14em] text-nc-lo">made from</span>
            </div>
          )}
          <div className="m-card px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-nc-hi">{mol.caption}</span>
              {mol.inStock !== null && (
                <span className="font-data text-[10px]" style={{ color: mol.inStock ? TONE_COLOR.ok : TONE_COLOR.bad }}>
                  {mol.inStock ? "in stock" : "not in stock"}
                </span>
              )}
            </div>
            {/* a viewBox wrapper, so the drawing fills whatever width the phone gives it */}
            <svg viewBox="0 0 300 120" className="my-1 h-[120px] w-full">
              <MoleculeSvg smiles={mol.smiles} width={300} height={120} />
            </svg>
            <p className="break-all font-data text-[9.5px] leading-snug text-nc-lo">{mol.smiles}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Card({ card, onOpen }: { card: RouteCard; onOpen: (o: Open) => void }) {
  const role = ROLE[card.role];
  const start = card.chain[0]?.smiles ?? "";
  return (
    <li>
      <article className={cx("m-card px-4 py-3.5", card.role === "recommended" && "m-card-lit")}>
        <div className="flex items-center gap-2">
          <StatusPill tone={role.tone}>{role.text}</StatusPill>
          <span className="ml-auto font-data text-[10px] text-nc-lo">route {card.routeId}</span>
        </div>

        <div className="mt-3 flex items-end gap-4">
          <div>
            <div className="font-data text-[28px] leading-none tabular-nums text-nc-hi">{card.steps}</div>
            <div className="mt-1 text-[10.5px] text-nc-lo">{card.steps === 1 ? "step" : "steps"}</div>
          </div>
          <div>
            <div
              className="font-data text-[28px] leading-none tabular-nums"
              style={{ color: card.memoryFlagged ? TONE_COLOR.bad : card.role === "recommended" ? TONE_COLOR.run : "rgb(var(--nc-mid))" }}
            >
              {card.score.toFixed(4)}
            </div>
            <div className="mt-1 text-[10.5px] text-nc-lo">route score</div>
          </div>
          <div className="ml-auto text-right">
            <StatusPill tone={card.verdict.tone === "ok" ? "ok" : card.verdict.tone === "bad" ? "bad" : "warn"}>{card.verdict.label}</StatusPill>
          </div>
        </div>

        <p className="mt-3 truncate font-data text-[10.5px] text-nc-lo" title={start}>
          from {start}
        </p>

        <div
          className="mt-3 flex items-start gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: card.memoryFlagged ? "rgb(var(--nc-bad) / 0.5)" : "rgb(var(--nc-line))" }}
        >
          <Brain className="mt-[1px] h-3.5 w-3.5 shrink-0" style={{ color: card.memoryFlagged ? TONE_COLOR.bad : TONE_COLOR.dim }} aria-hidden />
          <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-nc-mid">
            {card.memoryFlagged ? (
              <>
                Reuses a transformation flagged in an earlier investigation
                {card.checks.some((c) => c.simulated) && <SimBadge />}
              </>
            ) : (
              "No previous experience applies to this route"
            )}
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onOpen({ kind: "route", routeId: card.routeId })} className="m-chip flex-1">
            View route
          </button>
          <button type="button" onClick={() => onOpen({ kind: "why", routeId: card.routeId })} className="m-chip flex-1">
            Why?
          </button>
        </div>
      </article>
    </li>
  );
}

export function RouteList({
  routes,
  why,
  m,
  showCards = true,
  openDecision = false,
  onDecisionClose,
}: {
  routes: RouteCard[];
  why: WhyView | null;
  m: DashboardModel;
  /** false keeps the sheets available while the cards themselves stay folded away (the chat) */
  showCards?: boolean;
  /** the chat's "Why this decision?" chip opens the same sheet the recommended card does */
  openDecision?: boolean;
  onDecisionClose?: () => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const shown: Open = openDecision ? { kind: "decision" } : open;
  const close = () => {
    setOpen(null);
    onDecisionClose?.();
  };

  const card = shown && shown.kind !== "decision" ? routes.find((r) => r.routeId === shown.routeId) ?? null : null;
  const lessons = card
    ? [...new Set((m.memory.applied ?? []).filter((a) => a.routeId === card.routeId).map((a) => lessonOf(a.issue)))]
    : [];
  const simulated = card ? (m.memory.applied ?? []).some((a) => a.routeId === card.routeId && a.simulated) : false;

  const title =
    shown === null
      ? ""
      : shown.kind === "decision"
        ? "Why this decision?"
        : shown.kind === "route"
          ? `${card?.steps ?? 0}-step route`
          : card?.role === "recommended"
            ? "Why this route?"
            : "Why this route was ranked down";

  return (
    <>
      {showCards && (
        <ul className="space-y-3">
          {routes.map((r) => (
            <Card key={r.routeId} card={r} onOpen={setOpen} />
          ))}
        </ul>
      )}

      <Sheet open={shown !== null} onClose={close} title={title}>
        {shown?.kind === "route" && card && (
          <>
            <Chain card={card} />
            <h3 className="m-label mt-5">Checks</h3>
            <ul className="mt-2 space-y-1.5">
              {card.checks.map((c, i) => (
                <CheckRow key={`${c.text}-${i}`} tone={c.tone} text={c.text} simulated={c.simulated} />
              ))}
            </ul>
          </>
        )}

        {shown?.kind === "why" && card && (
          <>
            {card.role === "recommended" && why?.reason && <p className="text-[13px] leading-relaxed text-nc-mid">{why.reason}</p>}
            {lessons.length > 0 && (
              <div className="mt-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "rgb(var(--nc-bad) / 0.5)" }}>
                <h3 className="m-label" style={{ color: TONE_COLOR.bad }}>
                  Previous experience {simulated ? "(simulated)" : ""}
                </h3>
                <ul className="mt-1.5 space-y-1.5">
                  {lessons.map((l) => (
                    <li key={l} className="text-[12px] leading-snug text-nc-mid">
                      {l}
                      {simulated && <SimBadge />}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-nc-lo">
                  Each flagged step costs this route 0.15 of its score, which is what moved it down the ranking.
                </p>
              </div>
            )}
            <h3 className="m-label mt-5">Checks</h3>
            <ul className="mt-2 space-y-1.5">
              {(card.role === "recommended" && why ? why.checks : card.checks).map((c, i) => (
                <CheckRow key={`${c.text}-${i}`} tone={c.tone} text={c.text} simulated={c.simulated} />
              ))}
            </ul>
          </>
        )}

        {shown?.kind === "decision" && (
          <>
            <p className="text-[13px] leading-relaxed text-nc-mid">{why?.reason ?? m.outcome ?? "No recommendation was reported."}</p>
            {why && why.checks.length > 0 && (
              <>
                <h3 className="m-label mt-5">What decided it</h3>
                <ul className="mt-2 space-y-1.5">
                  {why.checks.map((c, i) => (
                    <CheckRow key={`${c.text}-${i}`} tone={c.tone} text={c.text} simulated={c.simulated} />
                  ))}
                </ul>
              </>
            )}
            {why && why.verdicts.length > 0 && (
              <>
                <h3 className="m-label mt-5">Each agent&apos;s verdict</h3>
                <ul className="mt-2 divide-y divide-nc-line/60">
                  {why.verdicts.map((v) => (
                    <li key={v.agent} className="flex items-center gap-3 py-2">
                      <span className="w-[108px] shrink-0 text-[12px] text-nc-hi">{v.agent}</span>
                      <span className="min-w-0 flex-1 text-[11.5px]" style={{ color: TONE_COLOR[v.tone === "ok" ? "ok" : v.tone === "bad" ? "bad" : "warn"] }}>
                        {v.verdict}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
