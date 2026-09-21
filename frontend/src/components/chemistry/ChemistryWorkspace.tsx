"use client";

import React from "react";
import { InProgress, WorkspaceGate } from "@/components/lab/WorkspaceGate";
import { MoleculeDrawing } from "./MoleculeSvg";
import { Field, NotReported, Panel, Tag } from "@/components/ui/primitives";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import type { AnalogueHit, MolecularProperties, SolubilityPrediction } from "@/types/chemistry";

const failed = (v: unknown): v is { error: string } =>
  typeof v === "object" && v !== null && "error" in v && typeof (v as { error: unknown }).error === "string";

export function ChemistryWorkspace() {
  const { run, runRecord } = useNeo();
  const result = useRunResult();
  const target = result?.target ?? (run.target ? { canonical_smiles: run.target.canonical_smiles, source: run.target.source, matched_name: run.target.matched_name, query: run.query ?? "" } : null);
  const profile = result?.profile ?? null;
  const props = profile?.properties && !failed(profile.properties) ? (profile.properties as MolecularProperties) : null;
  const sol = profile?.solubility && !failed(profile.solubility) ? (profile.solubility as SolubilityPrediction) : null;
  const analogues = profile?.analogues && !failed(profile.analogues) ? profile.analogues.hits : null;

  return (
    <WorkspaceGate>
      <div className="grid grid-cols-2 gap-px bg-nc-line">
        <Panel title="Target molecule" className="border-0 bg-nc-base">
          <div className="space-y-3 p-4">
            <Field label="Query" value={target?.query ?? run.query} mono />
            <Field label="Canonical SMILES" value={target?.canonical_smiles} mono />
            <Field label="Name" value={target?.matched_name} />
            <Field label="Resolved via" value={target?.source === "pubchem" ? "PubChem (name lookup)" : target?.source === "smiles" ? "Input was already a structure" : null} />
            {props && <Field label="InChIKey" value={props.inchikey} mono />}
            {target?.canonical_smiles ? (
              <div>
                <div className="border border-nc-line bg-nc-base/70">
                  <MoleculeDrawing smiles={target.canonical_smiles} width={420} height={230} />
                </div>
                <p className="mt-1 text-[10px] leading-snug text-nc-lo">
                  Drawn from the bond graph of the SMILES above. The 2D arrangement is a layout, not a computed conformer. Focus the molecule in the lab to rotate it in 3D and inspect atoms.
                </p>
              </div>
            ) : (
              <NotReported note="No target has been resolved for this run" />
            )}
          </div>
        </Panel>

        <Panel title="Descriptors (RDKit)" className="border-0 bg-nc-base">
          {!result ? (
            runRecord.state === "loading" || run.phase === "running" ? <InProgress what="The target profile" /> : <div className="p-4"><NotReported /></div>
          ) : failed(profile?.properties) ? (
            <div className="p-4 text-[12px] text-nc-bad">rdkit.represent failed: {(profile?.properties as { error: string }).error}</div>
          ) : props ? (
            <div className="grid grid-cols-3 gap-x-4 gap-y-3 p-4">
              <Field label="Formula" value={props.formula} mono />
              <Field label="Mol. weight" value={props.molecular_weight} mono />
              <Field label="logP" value={props.logp} mono />
              <Field label="TPSA" value={props.tpsa} mono />
              <Field label="HBD / HBA" value={`${props.hbd} / ${props.hba}`} mono />
              <Field label="Rotatable bonds" value={props.rotatable_bonds} mono />
              <Field label="Rings" value={props.rings} mono />
              <Field label="Stereocentres" value={props.stereocentres} mono />
              <Field label="Lipinski violations" value={props.lipinski_violations} mono />
            </div>
          ) : (
            <div className="p-4"><NotReported note="The research agent did not return descriptors" /></div>
          )}
        </Panel>

        <Panel title="Predicted solubility (QSAR)" className="border-0 bg-nc-base">
          <div className="space-y-2 p-4">
            {failed(profile?.solubility) ? (
              <div className="text-[12px] text-nc-warn">Unavailable: {(profile?.solubility as { error: string }).error}</div>
            ) : sol ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-data text-lg text-nc-hi">{sol.predicted_value}</span>
                  <span className="font-data text-[11px] text-nc-lo">{sol.units}</span>
                  <Tag tone="warn">predicted</Tag>
                </div>
                <p className="text-[12px] text-nc-lo">A model prediction with its own uncertainty, not a measurement.</p>
              </>
            ) : (
              <NotReported />
            )}
          </div>
        </Panel>

        <Panel title="Nearest approved drugs (ChEMBL)" className="border-0 bg-nc-base">
          <div className="p-4">
            {failed(profile?.analogues) ? (
              <div className="text-[12px] text-nc-warn">Unavailable: {(profile?.analogues as { error: string }).error}</div>
            ) : analogues ? (
              analogues.length ? (
                <table className="w-full font-data text-[11px]">
                  <thead>
                    <tr className="text-left text-nc-lo"><th className="pb-1 font-normal">SMILES</th><th className="pb-1 text-right font-normal">Tanimoto</th></tr>
                  </thead>
                  <tbody>
                    {analogues.map((h: AnalogueHit) => (
                      <tr key={String(h.molecule_id)} className="border-t border-nc-line/60">
                        <td className="max-w-[18rem] truncate py-1 text-nc-mid" title={h.smiles}>{h.smiles}</td>
                        <td className="py-1 text-right text-nc-hi">{h.tanimoto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="text-[12px] text-nc-mid">No analogues returned.</span>
              )
            ) : (
              <NotReported />
            )}
          </div>
        </Panel>
      </div>

      {result && (
        <Panel title={`Report · source: ${result.report_source}`} className="border-t border-nc-line">
          <div className="space-y-2 p-4">
            <div className="text-[13px] text-nc-hi">{result.recommendation}</div>
            <p className="max-w-3xl text-[12px] leading-relaxed text-nc-mid">{result.report}</p>
          </div>
        </Panel>
      )}
    </WorkspaceGate>
  );
}
