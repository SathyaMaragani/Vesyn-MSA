"use client";

// Ketcher, ported from RamChems' editor. Browser-only: load it with next/dynamic({ ssr: false }).
import React, { useEffect, useRef, useState } from "react";
import { Editor } from "ketcher-react";
import { StandaloneStructServiceProvider } from "ketcher-standalone";
import type { Ketcher } from "ketcher-core";
import "ketcher-react/dist/index.css";

// Runs the whole structure service in-browser (WASM) - no Ketcher server needed.
const structServiceProvider = new StandaloneStructServiceProvider();

/** Ketcher persists the last zoom, so a loaded molecule can arrive at 10% and read as an empty canvas. */
function fitView(ketcher: Ketcher) {
  try {
    const editor = ketcher.editor as unknown as { zoom?: (v?: number) => number; centerViewportAccordingToStruct?: () => void };
    editor.zoom?.(1); // ketcher.setZoom(1) silently no-ops in 3.18
    editor.centerViewportAccordingToStruct?.();
  } catch {
    // best-effort framing; never worth breaking a load over
  }
}

/** The canvas. `smiles` loads a structure in; every edit comes back out through onSmilesChange. */
export default function MoleculeEditor({ smiles, onSmilesChange }: { smiles: string; onSmilesChange: (smiles: string) => void }) {
  const ketcherRef = useRef<Ketcher | null>(null);
  const [ready, setReady] = useState(false);
  // Set while we push a structure IN, so the resulting 'change' does not bounce straight back out.
  const applying = useRef(false);
  // The last SMILES Ketcher produced; lets us skip re-loading its own output.
  const fromEditor = useRef<string | null>(null);

  useEffect(() => {
    const ketcher = ketcherRef.current;
    if (!ready || !ketcher || smiles === fromEditor.current) return;
    applying.current = true;
    ketcher
      .setMolecule(smiles.trim())
      .then(() => fitView(ketcher))
      .catch(() => undefined) // a half-typed SMILES; the caller reports validity
      .finally(() => setTimeout(() => (applying.current = false), 150));
  }, [smiles, ready]);

  const handleInit = (ketcher: Ketcher) => {
    ketcherRef.current = ketcher;
    (window as unknown as { ketcher?: Ketcher }).ketcher = ketcher; // what ketcher-react itself expects
    setReady(true);
    ketcher.editor.subscribe("change", async () => {
      if (applying.current) return;
      try {
        const drawn = (await ketcher.getSmiles()) ?? "";
        fromEditor.current = drawn;
        onSmilesChange(drawn);
      } catch {
        /* mid-edit */
      }
    });
  };

  return (
    <div className="relative h-full w-full">
      <Editor
        staticResourcesUrl=""
        structServiceProvider={structServiceProvider}
        errorHandler={(message: string) => console.error("[ketcher]", message)}
        onInit={handleInit}
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-white font-data text-[12px] text-neutral-500">
          Starting structure editor…
        </div>
      )}
    </div>
  );
}
