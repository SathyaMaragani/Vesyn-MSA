"use client";

// The dashboard's own frame: NOT the lab's. A command header - the brand, the search that starts a run (kept at the
// top, where it has always been; "/" focuses it from anywhere, and the Search tab has the full version), the project,
// the run's state and the connection - then the places in Vesyn, with the current one lit. The gold theme is a scope
// set here (.nc-dash), so the lab keeps its own palette. LAB is the one way in with a transition: a wipe that grows
// out of the pointer in the lab's own darkness.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleCheck, CircleX, Loader, Play, Search } from "lucide-react";
import { ConnectionPill, SimulatedNotice } from "@/components/layout/ConnectionPill";
import { DrawStructure } from "@/components/chemistry/DrawStructure";
import { cx } from "@/components/ui/primitives";
import { NAV, isActive } from "@/lib/nav";
import { useNeo } from "@/lib/store/NeoProvider";
import { PROMPT_PLACEHOLDER, useRunComposer } from "@/lib/store/useRunComposer";

type Origin = { x: number; y: number };
const EnterContext = createContext<(origin?: Origin) => void>(() => undefined);
/** Enter the lab, with the transition. */
export const useEnterLab = () => useContext(EnterContext);

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="2.4" className="fill-nc-cyan" />
      <circle cx="12" cy="5" r="2" className="fill-nc-hi" />
      <circle cx="12" cy="19" r="2" className="fill-nc-hi" />
      <circle cx="19" cy="12" r="2.4" className="fill-nc-cyan" />
      <path d="M5 12 12 5M5 12l7 7M12 5l7 7M12 19l7-7" className="stroke-nc-line-strong" strokeWidth="1.2" />
    </svg>
  );
}

/** The run's state, in the header: what the design shows as "Run Completed". */
function RunState() {
  const { run, demo } = useNeo();
  const [Icon, text, color] =
    run.phase === "completed"
      ? [CircleCheck, demo ? "Simulated run" : "Run completed", "text-nc-ok border-nc-ok/50"]
      : run.phase === "failed"
        ? [CircleX, "Run failed", "text-nc-bad border-nc-bad/50"]
        : run.phase === "running"
          ? [Loader, "Run active", "text-nc-cyan border-nc-cyan/50"]
          : [null, "No run", "text-nc-lo border-nc-line-strong"];
  return (
    <span className={cx("hidden h-9 items-center gap-2 rounded-lg border px-3 font-data text-[11.5px] lg:inline-flex", color)}>
      {Icon && <Icon className={cx("h-3.5 w-3.5", run.phase === "running" && "animate-spin [animation-duration:2.4s]")} aria-hidden />}
      {text}
    </span>
  );
}

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { projects, projectId, selectProject } = useNeo();
  const { prompt, setPrompt, smiles, setSmiles, busy, error, offline, ready, submit } = useRunComposer();
  const [entering, setEntering] = useState<Origin | null>(null);
  const [grown, setGrown] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    router.prefetch("/lab");
  }, [router]);

  // The search is one keystroke away from anywhere on the page: "/" (unless you are already typing), or any
  // "start a new run" button that fires nc:focus-run.
  useEffect(() => {
    const focus = () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      input.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      focus();
    };
    window.addEventListener("nc:focus-run", focus);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("nc:focus-run", focus);
      window.removeEventListener("keydown", onKey);
    };
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

  // A run started from the search page (or any page but the overview) is watched on the overview.
  const start = async (e: React.FormEvent) => {
    if ((await submit(e)) && pathname !== "/dashboard") router.push("/dashboard");
  };

  return (
    <EnterContext.Provider value={enterLab}>
      <div className="nc-dash min-h-screen bg-nc-base text-nc-hi">
        <header className="sticky top-0 z-40 border-b border-nc-line bg-nc-base/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1760px] items-center gap-6 px-8">
            <Link href="/" className="nc-focus flex shrink-0 items-center gap-3" aria-label="Vesyn — back to the entry">
              <Mark />
              <span className="font-data text-[18px] font-medium tracking-[0.34em]">
                VE<span className="text-nc-cyan">syn</span>
              </span>
            </Link>

            <form onSubmit={start} className="flex h-10 min-w-0 max-w-[680px] flex-1 items-center gap-2 rounded-lg border border-nc-line-strong bg-nc-raised/80 pl-3 pr-1 transition-colors focus-within:border-nc-cyan/70">
              <Search className="h-4 w-4 shrink-0 text-nc-lo" aria-hidden />
              <input
                ref={input}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={offline}
                spellCheck={false}
                placeholder={offline ? "API offline" : smiles ? "What to do with the drawn structure (default: retrosynthesis)" : PROMPT_PLACEHOLDER}
                aria-label="Ask Vesyn: task and molecule"
                className="h-full min-w-0 flex-1 bg-transparent font-data text-[12.5px] text-nc-hi outline-none placeholder:text-nc-lo disabled:opacity-50"
              />
              <kbd className="hidden rounded border border-nc-line-strong px-1.5 font-data text-[10px] text-nc-lo xl:inline" title="Press / to search from anywhere">/</kbd>
              <DrawStructure smiles={smiles} onChange={setSmiles} disabled={offline} />
              <button type="submit" disabled={!ready} className="nc-focus flex h-8 items-center gap-1.5 rounded-md bg-nc-cyan px-3.5 font-data text-[11px] font-semibold uppercase tracking-wider text-nc-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-nc-line disabled:text-nc-lo">
                <Play className="h-3 w-3" aria-hidden /> {busy ? "Starting" : "Run"}
              </button>
            </form>
            {error && <span role="alert" className="max-w-[220px] truncate font-data text-[11px] text-nc-bad" title={error}>{error}</span>}

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-nc-line-strong bg-nc-raised/60 pl-3 pr-1">
                <span className="font-data text-[11px] text-nc-lo">Project:</span>
                <select
                  value={projectId ?? ""}
                  onChange={(e) => e.target.value && void selectProject(e.target.value)}
                  disabled={offline || projects.state !== "ok"}
                  className="nc-focus h-7 w-48 truncate bg-transparent font-data text-[12px] text-nc-hi disabled:opacity-50"
                >
                  <option value="">{projects.state === "ok" ? "Select…" : projects.state === "empty" ? "No projects yet" : "—"}</option>
                  {projects.state === "ok" && projects.data.map((p) => <option key={p.id} value={p.id} className="bg-nc-base">{p.name} · {p.status}</option>)}
                </select>
              </label>
              <RunState />
              <ConnectionPill />
            </div>
          </div>

          <nav aria-label="Vesyn" className="mx-auto flex h-11 max-w-[1760px] items-end gap-1 px-8">
            {NAV.map((t) => {
              const active = isActive(t.href, pathname);
              const cls = cx(
                "nc-focus relative px-4 pb-3 font-data text-[11.5px] uppercase tracking-[0.18em] transition-colors",
                active ? "text-nc-cyan" : "text-nc-lo hover:text-nc-mid",
              );
              const bar = active && <span aria-hidden className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-nc-cyan shadow-[0_0_12px_rgb(var(--nc-cyan))]" />;
              return t.href === "/lab" ? (
                <a key={t.href} href={t.href} className={cls} onClick={(e) => { e.preventDefault(); enterLab({ x: e.clientX, y: e.clientY }); }}>
                  {t.label}
                  {bar}
                </a>
              ) : (
                <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cls}>
                  {t.label}
                  {bar}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-[1760px] px-8 pb-24 pt-6">
          <SimulatedNotice className="mb-5" />
          {children}
        </main>
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
