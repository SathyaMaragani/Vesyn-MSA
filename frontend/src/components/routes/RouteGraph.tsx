"use client";

import React, { useMemo, useState } from "react";
import { MoleculeSvg } from "@/components/chemistry/MoleculeSvg";
import { COL, MOL_H, MOL_W, RXN_W, layoutRoute, type GraphMol, type GraphRxn } from "@/lib/events/routeGraph";
import type { RouteNode, RouteReaction } from "@/types/routes";

const TONE = { ok: "rgb(var(--nc-ok))", warn: "rgb(var(--nc-warn))", bad: "rgb(var(--nc-bad))", dim: "rgb(var(--nc-line-strong))" } as const;
type Tone = keyof typeof TONE;

const stepTone = (r: RouteReaction): Tone => {
  const s = String(r.assessment?.summary ?? "");
  if (s === "REVIEW_REQUIRED") return "bad";
  if (s === "INSUFFICIENT_EVIDENCE") return "warn";
  if (s === "SUPPORTED" || s === "STRONGLY_SUPPORTED" || s === "STRONG_SUPPORT") return "ok";
  return "dim";
};
const validationTone = (status?: string): Tone =>
  status === "MATCH" ? "ok" : status === "PARTIAL_MATCH" ? "warn" : status === "MISMATCH" || status === "MODEL_OUTPUT_INVALID" ? "bad" : "dim";
const literatureTone = (level?: string): Tone => (level === "experimental" ? "ok" : level === "similar_experimental" ? "warn" : "dim");

const PAD = 16;

/**
 * A synthesis route drawn as what it is: the target on the left, each reaction as
 * a node, each precursor as its own structure. Reaction nodes carry the verdict;
 * the three pips under a node are the independent signals (structural check,
 * forward model, literature) so a failure is readable at a glance - and grey
 * means "no signal", never "passed".
 */
export function RouteGraph({
  tree,
  selectedStep,
  onSelectStep,
}: {
  tree: RouteNode;
  selectedStep: number | null;
  onSelectStep: (step: number) => void;
}) {
  const layout = useMemo(() => layoutRoute(tree), [tree]);
  const [zoom, setZoom] = useState(1);
  const byId = useMemo(() => {
    const m = new Map<string, { x: number; y: number; w: number }>();
    for (const n of layout.mols) m.set(n.id, { x: n.x, y: n.y, w: MOL_W });
    for (const n of layout.rxns) m.set(n.id, { x: n.x, y: n.y, w: RXN_W });
    return m;
  }, [layout]);

  const W = layout.width + PAD * 2;
  const H = layout.height + PAD * 2;

  return (
    <div className="border border-nc-line bg-nc-base/60">
      <div className="flex items-center justify-between border-b border-nc-line px-3 py-1.5">
        <span className="nc-label">Route · target → precursors</span>
        <span className="flex items-center gap-1 font-data text-[10px] text-nc-lo">
          <span className="mr-2 flex items-center gap-2">
            <i className="inline-block h-2 w-2" style={{ background: TONE.ok }} /> supported
            <i className="inline-block h-2 w-2" style={{ background: TONE.warn }} /> insufficient
            <i className="inline-block h-2 w-2" style={{ background: TONE.bad }} /> review required
            <i className="inline-block h-2 w-2" style={{ background: TONE.dim }} /> no signal
          </span>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} className="nc-focus h-5 w-5 border border-nc-line-strong hover:text-nc-hi" aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} className="nc-focus h-5 w-5 border border-nc-line-strong hover:text-nc-hi" aria-label="Zoom in">+</button>
        </span>
      </div>
      <div className="max-h-[26rem] overflow-auto">
        <svg width={W * zoom} height={H * zoom} viewBox={`${-PAD} ${-PAD} ${W} ${H}`} role="group" aria-label="Synthesis route">
          {/* edges first, so nodes sit on top */}
          {layout.edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const fromIsMol = e.from.startsWith("m");
            const x1 = fromIsMol ? a.x + MOL_W : a.x + RXN_W;
            const x2 = b.x;
            const mx = (x1 + x2) / 2;
            return <path key={`${e.from}-${e.to}`} d={`M ${x1} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${x2} ${b.y}`} fill="none" stroke="rgb(var(--nc-line-strong))" strokeWidth={1.4} />;
          })}
          {layout.mols.map((m) => (
            <MolNode key={m.id} m={m} />
          ))}
          {layout.rxns.map((r) => (
            <RxnNode key={r.id} r={r} selected={selectedStep === r.step} onSelect={() => onSelectStep(r.step)} />
          ))}
        </svg>
      </div>
      <div className="border-t border-nc-line px-3 py-1 font-data text-[10px] text-nc-lo">
        Structures are layouts of each SMILES&apos;s bond graph, not computed conformers. Column spacing {COL}px.
      </div>
    </div>
  );
}

function MolNode({ m }: { m: GraphMol }) {
  const label = m.isTarget ? "TARGET" : m.leaf ? (m.inStock ? "IN STOCK" : "NOT IN STOCK") : "INTERMEDIATE";
  const tone: Tone = m.isTarget ? "ok" : m.leaf ? (m.inStock ? "ok" : "warn") : "dim";
  const border = m.isTarget ? "rgb(var(--nc-cyan))" : TONE[tone];
  return (
    <g transform={`translate(${m.x} ${m.y - MOL_H / 2})`}>
      <rect width={MOL_W} height={MOL_H} fill="rgb(var(--nc-panel))" stroke={border} strokeOpacity={m.isTarget ? 0.8 : 0.5} strokeWidth={1} />
      <MoleculeSvg smiles={m.smiles} width={MOL_W - 8} height={MOL_H - 34} x={4} y={4} bg="#0f141a" />
      <text x={6} y={MOL_H - 20} fontSize="8.5" fill="rgb(154 171 186)" fontFamily="var(--nc-font-data)">
        {m.smiles.length > 24 ? `${m.smiles.slice(0, 23)}…` : m.smiles}
        <title>{m.smiles}</title>
      </text>
      <text x={6} y={MOL_H - 7} fontSize="8.5" letterSpacing="0.1em" fill={m.isTarget ? "rgb(var(--nc-cyan))" : TONE[tone]} fontFamily="var(--nc-font-data)">
        {label}
      </text>
    </g>
  );
}

function RxnNode({ r, selected, onSelect }: { r: GraphRxn; selected: boolean; onSelect: () => void }) {
  const tone = stepTone(r.reaction);
  const cx = r.x + RXN_W / 2;
  const pips: { k: string; tone: Tone; title: string }[] = [
    { k: "S", tone: validationTone(r.reaction.structural_validation?.status), title: `RDKit template check: ${r.reaction.structural_validation?.status ?? "no signal"}` },
    { k: "F", tone: validationTone(r.reaction.forward_validation?.status), title: `Forward model: ${r.reaction.forward_validation?.status ?? "no signal"}` },
    { k: "L", tone: literatureTone(r.reaction.evidence?.evidence_level), title: `Literature: ${r.reaction.evidence?.evidence_level ?? "no signal"}` },
  ];
  return (
    <g onClick={onSelect} style={{ cursor: "pointer" }} role="button" aria-label={`Reaction step ${r.step}`} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}>
      {selected && <circle cx={cx} cy={r.y} r={22} fill="none" stroke="rgb(var(--nc-cyan))" strokeWidth={1.4} />}
      <circle cx={cx} cy={r.y} r={16} fill="rgb(var(--nc-panel))" stroke={TONE[tone]} strokeWidth={2.2} />
      <text x={cx} y={r.y + 4} textAnchor="middle" fontSize="12" fontWeight={600} fill="rgb(232 241 248)" fontFamily="var(--nc-font-data)">
        {r.step}
      </text>
      {pips.map((p, i) => (
        <g key={p.k} transform={`translate(${cx - 15 + i * 11} ${r.y + 21})`}>
          <rect width={8} height={8} fill={TONE[p.tone]} opacity={p.tone === "dim" ? 0.5 : 1} />
          <title>{p.title}</title>
        </g>
      ))}
    </g>
  );
}
