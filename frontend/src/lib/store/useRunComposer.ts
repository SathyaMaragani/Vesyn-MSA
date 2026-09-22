"use client";

import type React from "react";
import { useState } from "react";
import { useNeo } from "./NeoProvider";

/** State for a "start a run" bar: a plain-words prompt and/or a drawn structure. */
export function useRunComposer() {
  const { health, launch } = useNeo();
  const [prompt, setPrompt] = useState("");
  const [smiles, setSmiles] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Offline only once the check has failed: while it is still pending the API is not known to be down.
  const offline = health === "offline";
  const ready = health === "online" && !busy && (prompt.trim() !== "" || smiles !== "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const r = await launch(prompt, smiles);
    setBusy(false);
    if (r.status === "ok") {
      setPrompt("");
      setSmiles("");
    } else setError(r.message);
  }

  return { prompt, setPrompt, smiles, setSmiles, busy, error, offline, ready, submit };
}

export const PROMPT_PLACEHOLDER = "Ask — “synthesis of aspirin”, “solubility of CCO”, “drugs similar to caffeine”";
