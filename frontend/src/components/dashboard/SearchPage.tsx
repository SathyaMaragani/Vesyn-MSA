"use client";

// SEARCH: the full version of the bar at the top. Ask in plain words, or draw the structure; the run starts and the
// overview shows it. Below: questions that work, what Vesyn can answer (the backend's own task list,
// backend/mas/intent.py), and earlier investigations to reopen.
import React, { useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, History, Play, Search, Sparkles } from "lucide-react";
import { DrawStructure } from "@/components/chemistry/DrawStructure";
import { cx } from "@/components/ui/primitives";
import { useNeo } from "@/lib/store/NeoProvider";
import { PROMPT_PLACEHOLDER, useRunComposer } from "@/lib/store/useRunComposer";
import { Card, StatusPill } from "./ui";

const EXAMPLES = [
  "Find a synthesis route for gefitinib",
  "Plan a synthesis of aspirin",
  "Find a synthesis route for erlotinib",
  "What is the solubility of caffeine?",
  "Drugs similar to ibuprofen",
  "Profile paracetamol",
];

// backend/mas/intent.py TASKS - what the Orchestrator can route a request to
const TASKS = [
  { task: "Retrosynthesis", what: "Routes to make it from purchasable precursors, validated step by step" },
  { task: "Profile", what: "Descriptors, predicted solubility and the most similar approved drugs" },
  { task: "Properties", what: "RDKit descriptors and drug-likeness" },
  { task: "Solubility", what: "Predicted aqueous solubility with an interval" },
  { task: "Analogues", what: "The most similar approved drugs (ChEMBL)" },
];

const STATUS_TONE = { COMPLETED: "ok", FAILED: "bad", RUNNING: "run", QUEUED: "run" } as const;

export function SearchPage() {
  const router = useRouter();
  const { projects, selectProject } = useNeo();
  const { prompt, setPrompt, smiles, setSmiles, busy, error, offline, ready, submit } = useRunComposer();
  const field = useRef<HTMLInputElement>(null);

  const start = async (e: React.FormEvent) => {
    if (await submit(e)) router.push("/dashboard");
  };
  const reopen = async (id: string) => {
    await selectProject(id);
    router.push("/dashboard");
  };

  return (
    <div className="mx-auto max-w-[980px] pt-6">
      <div className="text-center">
        <div className="font-data text-[11px] uppercase tracking-[0.3em] text-nc-cyan">Ask Vesyn</div>
        <h1 className="mt-3 text-[40px] font-semibold leading-tight tracking-tight text-nc-hi">What should the team investigate?</h1>
        <p className="mt-2 text-[13px] text-nc-mid">A task and a molecule in plain words - a name or a SMILES - or draw the structure.</p>
      </div>

      <form onSubmit={start} className="nc-card nc-card-lit mt-8 flex items-center gap-3 p-2.5 pl-4">
        <Search className="h-5 w-5 shrink-0 text-nc-cyan" aria-hidden />
        <input
          ref={field}
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={offline}
          spellCheck={false}
          placeholder={offline ? "API offline" : smiles ? "What to do with the drawn structure (default: retrosynthesis)" : PROMPT_PLACEHOLDER}
          aria-label="Ask Vesyn: task and molecule"
          className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-nc-hi outline-none placeholder:text-nc-lo disabled:opacity-50"
        />
        <DrawStructure smiles={smiles} onChange={setSmiles} disabled={offline} height="h-11" />
        <button type="submit" disabled={!ready} className="nc-focus flex h-11 items-center gap-2 rounded-lg bg-nc-cyan px-5 font-data text-[12px] font-semibold uppercase tracking-wider text-nc-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-nc-line disabled:text-nc-lo">
          <Play className="h-3.5 w-3.5" aria-hidden /> {busy ? "Starting" : "Investigate"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-center font-data text-[12px] text-nc-bad">{error}</p>}
      {smiles && <p className="mt-3 text-center font-data text-[11px] text-nc-mid">Drawn structure: <span className="text-nc-hi">{smiles}</span> - it wins over any molecule the words name.</p>}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setPrompt(ex); field.current?.focus(); }} disabled={offline} className="nc-btn rounded-full px-3 py-1.5 text-[11.5px] disabled:opacity-50">
            <Sparkles className="h-3 w-3 text-nc-cyan" aria-hidden /> {ex}
          </button>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="What Vesyn can answer">
          <ul className="space-y-2.5">
            {TASKS.map((t) => (
              <li key={t.task} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nc-cyan" aria-hidden />
                <div>
                  <div className="text-[12.5px] font-medium text-nc-hi">{t.task}</div>
                  <div className="text-[11.5px] leading-snug text-nc-lo">{t.what}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4 text-nc-cyan" aria-hidden /> Recent investigations</span>}>
          {projects.state !== "ok" ? (
            <p className="text-[12px] text-nc-lo">{projects.state === "empty" ? "Nothing investigated yet." : offline ? "The API is offline." : "Loading…"}</p>
          ) : (
            <ul className="-mx-1 max-h-[320px] space-y-0.5 overflow-y-auto">
              {projects.data.slice(0, 12).map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => void reopen(p.id)} className={cx("nc-focus group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-nc-cyan/[0.06]")}>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-nc-hi">{p.name}</span>
                    <StatusPill tone={STATUS_TONE[p.status as keyof typeof STATUS_TONE] ?? "dim"}>{p.status.charAt(0) + p.status.slice(1).toLowerCase()}</StatusPill>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-nc-lo transition-transform group-hover:translate-x-0.5 group-hover:text-nc-cyan" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
