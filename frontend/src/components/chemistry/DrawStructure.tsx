"use client";

import dynamic from "next/dynamic";
import React, { useRef, useState } from "react";
import { Hexagon, X } from "lucide-react";

const MoleculeEditor = dynamic(() => import("./MoleculeEditor"), { ssr: false });

const BTN = "nc-focus flex items-center gap-1.5 border px-2.5 font-data text-[11px] uppercase tracking-wider";

/**
 * "Draw" in a run composer: opens Ketcher in a dialog. The attached structure shows as a chip (click to edit,
 * × to detach) and is sent with the prompt, where it wins over any molecule the prompt names.
 */
export function DrawStructure({ smiles, onChange, disabled, height = "h-8" }: { smiles: string; onChange: (smiles: string) => void; disabled?: boolean; height?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Ketcher boots a WASM structure service: mount it on first open, then keep it.
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(smiles);
  const open = () => {
    setDraft(smiles);
    setOpened(true);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      {smiles ? (
        <span className={`${BTN} ${height} border-nc-cyan/60 text-nc-cyan normal-case tracking-normal`}>
          <button type="button" onClick={open} title={`Drawn structure: ${smiles} (click to edit)`} className="nc-focus flex min-w-0 max-w-[10rem] items-center gap-1.5">
            <Hexagon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{smiles}</span>
          </button>
          <button type="button" onClick={() => onChange("")} aria-label="Remove the drawn structure" className="nc-focus">
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ) : (
        <button type="button" onClick={open} disabled={disabled} title="Draw a structure" className={`${BTN} ${height} border-nc-line-strong text-nc-mid hover:text-nc-hi disabled:cursor-not-allowed disabled:opacity-50`}>
          <Hexagon className="h-3 w-3" aria-hidden /> Draw
        </button>
      )}

      <dialog ref={dialog} aria-label="Draw a structure" className="w-[min(1100px,94vw)] border border-nc-line-strong bg-nc-base p-0 text-nc-hi backdrop:bg-black/60">
        <div className="flex h-[min(720px,86vh)] flex-col">
          <div className="flex items-center justify-between border-b border-nc-line px-4 py-2 font-data text-[11px] uppercase tracking-[0.16em]">
            Draw a structure
            <button type="button" onClick={close} aria-label="Close" className="nc-focus text-nc-mid hover:text-nc-hi">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 bg-white">{opened && <MoleculeEditor smiles={draft} onSmilesChange={setDraft} />}</div>
          <div className="flex items-center gap-3 border-t border-nc-line px-4 py-2">
            <span className="min-w-0 flex-1 truncate font-data text-[11px] text-nc-mid" title={draft}>
              {draft || "Nothing drawn yet"}
            </span>
            <button type="button" onClick={close} className={`${BTN} h-8 border-nc-line-strong text-nc-mid hover:text-nc-hi`}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(draft.trim());
                close();
              }}
              disabled={!draft.trim()}
              className={`${BTN} h-8 border-nc-cyan/60 text-nc-cyan hover:bg-nc-cyan/10 disabled:cursor-not-allowed disabled:border-nc-line disabled:text-nc-lo`}
            >
              Use structure
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
