"use client";

// The dashboard's own frame: NOT the lab's. A command header (brand, project, run, the way to start a run, the
// connection), the seven-place navigation with the current place marked, and the one intentional way into the
// lab: a wipe that grows out of the pointer in the lab's own darkness and hands over to the lab's arrival.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Play } from "lucide-react";
import { ConnectionPill } from "@/components/layout/ConnectionPill";
import { DrawStructure } from "@/components/chemistry/DrawStructure";
import { cx } from "@/components/ui/primitives";
import { useNeo } from "@/lib/store/NeoProvider";
import { PROMPT_PLACEHOLDER, useRunComposer } from "@/lib/store/useRunComposer";

type Origin = { x: number; y: number };
const EnterContext = createContext<(origin?: Origin) => void>(() => undefined);
/** Enter the lab, with the transition. */
export const useEnterLab = () => useContext(EnterContext);

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/lab", label: "Lab" },
  { href: "/lab/chemistry", label: "Chemistry" },
  { href: "/lab/routes", label: "Routes" },
  { href: "/lab/evidence", label: "Evidence" },
  { href: "/lab/intelligence", label: "Intelligence" },
  { href: "/lab/audit", label: "Audit" },
] as const;

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="2.4" className="fill-nc-cyan" />
      <circle cx="12" cy="5" r="2" className="fill-nc-hi" />
      <circle cx="12" cy="19" r="2" className="fill-nc-hi" />
      <circle cx="19" cy="12" r="2.4" className="fill-nc-cyan" />
      <path d="M5 12 12 5M5 12l7 7M12 5l7 7M12 19l7-7" className="stroke-nc-line-strong" strokeWidth="1.2" />
    </svg>
  );
}

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { projects, projectId, selectProject, runId } = useNeo();
  const { prompt, setPrompt, smiles, setSmiles, busy, error, offline, ready, submit } = useRunComposer();
  const [entering, setEntering] = useState<Origin | null>(null);
  const [grown, setGrown] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    router.prefetch("/lab");
  }, [router]);

  // "Start new run" anywhere on the page focuses the command bar
  useEffect(() => {
    const focus = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      input.current?.focus();
    };
    window.addEventListener("nc:focus-run", focus);
    return () => window.removeEventListener("nc:focus-run", focus);
  }, []);

  const enterLab = useCallback(
    (origin?: Origin) => {
      if (entering) return;
      const o = origin && (origin.x || origin.y) ? origin : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setEntering(o);
      requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
      window.setTimeout(() => router.push("/lab"), reduced ? 0 : 780);
    },
    [entering, router],
  );

  return (
    <EnterContext.Provider value={enterLab}>
      <div className="min-h-screen bg-nc-base text-nc-hi">
        <header className="sticky top-0 z-40 border-b border-nc-line bg-nc-base/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1760px] items-center gap-5 px-8">
            <Link href="/" className="nc-focus flex items-center gap-2.5" aria-label="Vesyn — back to the entry">
              <Mark />
              <span className="font-data text-[15px] font-semibold tracking-[0.2em]">
                VE<span className="text-nc-cyan">syn</span>
              </span>
            </Link>
            <span className="h-5 w-px bg-nc-line" />
            <label className="flex items-center gap-2">
              <span className="nc-label">Project</span>
              <select
                value={projectId ?? ""}
                onChange={(e) => e.target.value && void selectProject(e.target.value)}
                disabled={offline || projects.state !== "ok"}
                className="nc-focus h-8 w-52 border border-nc-line-strong bg-nc-base px-2 font-data text-[12px] text-nc-hi disabled:opacity-50"
              >
                <option value="">{projects.state === "ok" ? "Select…" : projects.state === "empty" ? "No projects yet" : "—"}</option>
                {projects.state === "ok" && projects.data.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.status}</option>)}
              </select>
            </label>
            <span className="hidden font-data text-[11px] text-nc-lo xl:inline">
              RUN <span className="text-nc-mid">{runId ? runId.replace(/^run_/, "RUN-").toUpperCase() : "—"}</span>
            </span>

            <form onSubmit={submit} className="ml-auto flex w-[560px] max-w-[44vw] items-center gap-2">
              <input
                ref={input}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={offline}
                spellCheck={false}
                placeholder={offline ? "API offline" : smiles ? "What to do with the drawn structure (default: retrosynthesis)" : PROMPT_PLACEHOLDER}
                aria-label="Ask Vesyn: task and molecule"
                className="nc-focus h-8 min-w-0 flex-1 border border-nc-line-strong bg-nc-base px-2.5 font-data text-[12px] text-nc-hi placeholder:text-nc-lo disabled:opacity-50"
              />
              <DrawStructure smiles={smiles} onChange={setSmiles} disabled={offline} />
              <button type="submit" disabled={!ready} className="nc-focus flex h-8 items-center gap-1.5 border border-nc-cyan/60 px-3 font-data text-[11px] uppercase tracking-wider text-nc-cyan hover:bg-nc-cyan/10 disabled:cursor-not-allowed disabled:border-nc-line disabled:text-nc-lo disabled:hover:bg-transparent">
                <Play className="h-3 w-3" aria-hidden /> {busy ? "Starting" : "Run"}
              </button>
            </form>
            {error && <span role="alert" className="max-w-[220px] truncate font-data text-[11px] text-nc-bad" title={error}>{error}</span>}
            <ConnectionPill />
          </div>

          <div className="mx-auto flex h-11 max-w-[1760px] items-end justify-between px-8">
            <nav aria-label="Vesyn" className="flex items-end gap-1">
              {NAV.map((t) => {
                const active = t.href === "/dashboard";
                const cls = cx("nc-focus border-b-2 px-3.5 pb-2.5 font-data text-[11px] uppercase tracking-[0.16em]", active ? "border-nc-cyan text-nc-hi" : "border-transparent text-nc-lo hover:text-nc-mid");
                return t.href === "/lab" ? (
                  <a key={t.href} href={t.href} className={cls} onClick={(e) => { e.preventDefault(); enterLab({ x: e.clientX, y: e.clientY }); }}>
                    {t.label}
                  </a>
                ) : (
                  <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cls}>{t.label}</Link>
                );
              })}
            </nav>
            <button type="button" onClick={(e) => enterLab({ x: e.clientX, y: e.clientY })} className="nc-focus group mb-1.5 flex h-8 items-center gap-2.5 border border-nc-cyan/70 bg-nc-cyan/[0.08] px-4 font-data text-[11px] uppercase tracking-[0.2em] text-nc-cyan transition-colors hover:bg-nc-cyan hover:text-nc-base">
              Enter lab <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1760px] px-8 pb-24 pt-8">{children}</main>
      </div>

      {entering && (
        <div
          role="status"
          aria-label="Entering the lab"
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "#10110f", clipPath: `circle(${grown ? "150%" : "0px"} at ${entering.x}px ${entering.y}px)`, transition: "clip-path 760ms cubic-bezier(.65,0,.25,1)" }}
        >
          <div className="text-center transition-opacity duration-500" style={{ opacity: grown ? 1 : 0, transitionDelay: "260ms" }}>
            <div className="font-data text-[11px] uppercase tracking-[0.36em] text-nc-cyan">Entering the facility</div>
            <div className="mx-auto mt-4 h-px w-40 overflow-hidden bg-nc-line">
              <div className="nc-enter-bar h-px w-full bg-nc-cyan" />
            </div>
          </div>
        </div>
      )}
    </EnterContext.Provider>
  );
}
