"use client";

import React, { useMemo } from "react";
import { X } from "lucide-react";
import { MoleculeDrawing } from "@/components/chemistry/MoleculeSvg";
import { Field, NotReported, Panel, Tag } from "@/components/ui/primitives";
import { elementCss, getMolecule } from "@/lib/chem/molecule";
import { neighborsOf } from "@/lib/chem/smiles";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import type { MolecularProperties } from "@/types/chemistry";

const BOND_NAME: Record<number, string> = { 1: "single", 1.5: "aromatic", 2: "double", 3: "triple" };

/**
 * The molecule the run is about. The structure is the bond graph parsed from the
 * SMILES the backend resolved; the formula is cross-checked against the backend's
 * own RDKit descriptor when the research agent produced one.
 */
export function MoleculePanel() {
  const { run } = useNeo();
  const result = useRunResult();
  const { focus, selectedAtom, selectAtom, selectedBond, selectBond, select } = useLabUI();
  const smiles = run.target?.canonical_smiles ?? null;
  const res = useMemo(() => (smiles ? getMolecule(smiles) : null), [smiles]);

  if (focus?.kind !== "core" && focus?.kind !== "molecule" && selectedAtom === null && selectedBond === null) return null;

  const props = result?.profile?.properties;
  const backendFormula = props && !("error" in props) ? (props as MolecularProperties).formula : null;

  return (
    <div className="pointer-events-auto absolute bottom-16 left-3 top-24 z-20 w-80">
      <Panel
        title="Target molecule"
        className="h-full bg-nc-base/80 backdrop-blur-md"
        bodyClassName="overflow-y-auto"
        aside={
          <button type="button" onClick={() => { selectAtom(null); selectBond(null); select(null); }} aria-label="Close" className="nc-focus text-nc-lo hover:text-nc-hi">
            <X className="h-3.5 w-3.5" />
          </button>
        }
      >
        {!smiles || !res ? (
          <div className="space-y-2 p-4 text-[12px] text-nc-mid">
            <div className="font-data text-[11px] uppercase tracking-wider text-nc-lo">No target yet</div>
            The core shows an abstract marker until a run resolves a molecule. It is not a structure.
          </div>
        ) : !res.ok ? (
          <div className="space-y-2 p-4 text-[12px]">
            <Tag tone="bad">structure unreadable</Tag>
            <div className="break-all font-data text-[11px] text-nc-mid">{smiles}</div>
            <div className="text-nc-mid">The bond graph could not be parsed: {res.error}. Nothing is drawn rather than guessing.</div>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="border border-nc-line bg-nc-base/70">
              <MoleculeDrawing smiles={smiles} width={288} height={190} highlight={selectedAtom} onAtomClick={(i) => selectAtom(selectedAtom === i ? null : i)} />
            </div>
            <Field label="Name" value={run.target?.matched_name} />
            <Field label="SMILES" value={smiles} mono />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Formula" value={res.molecule.formula} mono />
              <Field label="Heavy atoms" value={res.molecule.graph.atoms.length} mono />
              <Field label="Bonds" value={res.molecule.graph.bonds.length} mono />
            </div>
            <div className="text-[11px]">
              <span className="nc-label mr-2">RDKit formula (backend)</span>
              {backendFormula ? (
                backendFormula === res.molecule.formula ? (
                  <Tag tone="ok">{backendFormula} · matches</Tag>
                ) : (
                  <Tag tone="warn">{backendFormula} · differs from parsed graph</Tag>
                )
              ) : (
                <NotReported note="The research agent has not reported descriptors for this run" />
              )}
            </div>

            {selectedAtom !== null && res.molecule.graph.atoms[selectedAtom] && (
              <div className="border border-nc-cyan/40 bg-nc-cyan/[0.05] p-3">
                <div className="nc-label mb-1">Atom {selectedAtom}</div>
                {(() => {
                  const a = res.molecule.graph.atoms[selectedAtom];
                  const nb = neighborsOf(res.molecule.graph, selectedAtom);
                  return (
                    <div className="space-y-1 font-data text-[11px] text-nc-mid">
                      <div>
                        <span style={{ color: elementCss(a.element) }} className="text-sm font-semibold">{a.element}</span>
                        {a.aromatic ? " · aromatic" : ""}
                        {a.charge ? ` · charge ${a.charge > 0 ? "+" : ""}${a.charge}` : ""}
                      </div>
                      <div>
                        H {a.hydrogens} <span className="text-nc-lo">({a.hydrogensImplicit ? "implied by valence" : "written in the SMILES"})</span>
                      </div>
                      <div>
                        bonded to:{" "}
                        {nb.map((k) => {
                          const b = res.molecule.graph.bonds.find((x) => (x.a === selectedAtom && x.b === k) || (x.b === selectedAtom && x.a === k));
                          return (
                            <span key={k} className="mr-2">
                              {res.molecule.graph.atoms[k].element}
                              <span className="text-nc-lo">{k}</span> <span className="text-nc-lo">({BOND_NAME[b?.order ?? 1]})</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {selectedBond !== null && res.molecule.graph.bonds[selectedBond] && (
              <div className="border border-nc-cyan/40 bg-nc-cyan/[0.05] p-3">
                <div className="nc-label mb-1">Bond {selectedBond}</div>
                {(() => {
                  const b = res.molecule.graph.bonds[selectedBond];
                  const a = res.molecule.graph.atoms[b.a];
                  const c = res.molecule.graph.atoms[b.b];
                  return (
                    <div className="space-y-1 font-data text-[11px] text-nc-mid">
                      <div>
                        <span style={{ color: elementCss(a.element) }} className="text-sm font-semibold">{a.element}</span>
                        <span className="text-nc-lo">{b.a}</span> — <span style={{ color: elementCss(c.element) }} className="text-sm font-semibold">{c.element}</span>
                        <span className="text-nc-lo">{b.b}</span>
                      </div>
                      <div>{BOND_NAME[b.order] ?? `order ${b.order}`} bond</div>
                    </div>
                  );
                })()}
              </div>
            )}

            <p className="border-t border-nc-line pt-2 text-[10px] leading-snug text-nc-lo">
              Atoms and bonds are the graph the SMILES denotes. Positions, in 2D and 3D, are a layout of that graph — not a computed conformer or crystal
              structure. Click any atom or bond to inspect it.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
