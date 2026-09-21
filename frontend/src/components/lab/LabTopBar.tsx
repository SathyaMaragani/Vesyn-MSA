"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Play } from "lucide-react";
import { ConnectionPill } from "@/components/layout/ConnectionPill";
import { cx } from "@/components/ui/primitives";
import { useNeo } from "@/lib/store/NeoProvider";

const TABS = [
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
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="2.4" className="fill-nc-cyan" />
      <circle cx="12" cy="5" r="2" className="fill-nc-hi" />
      <circle cx="12" cy="19" r="2" className="fill-nc-hi" />
      <circle cx="19" cy="12" r="2.4" className="fill-nc-cyan" />
      <path d="M5 12 12 5M5 12l7 7M12 5l7 7M12 19l7-7" className="stroke-nc-line-strong" strokeWidth="1.2" />
    </svg>
  );
}

export function LabTopBar() {
  const pathname = usePathname();
  const { health, projects, projectId, selectProject, launch, runId } = useNeo();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = health !== "online";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim() || busy || offline) return;
    setBusy(true);
    setError(null);
    const result = await launch(target);
    setBusy(false);
    if (result.status === "ok") setTarget("");
    else setError(result.message);
  }

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-30 border-b border-nc-line bg-nc-base/80 backdrop-blur-md">
      <div className="flex h-11 items-center gap-4 px-3">
        <Link href="/" className="nc-focus flex items-center gap-2" aria-label="NEOchems — back to the airlock">
          <Mark />
          <span className="font-data text-[13px] font-semibold tracking-[0.2em]">
            NEO<span className="text-nc-cyan">chems</span>
          </span>
        </Link>

        <label className="flex items-center gap-2">
          <span className="nc-label">Project</span>
          <select
            value={projectId ?? ""}
            onChange={(e) => e.target.value && void selectProject(e.target.value)}
            disabled={offline || projects.state !== "ok"}
            className="nc-focus h-7 w-48 border border-nc-line-strong bg-nc-base px-2 font-data text-[12px] text-nc-hi disabled:opacity-50"
          >
            <option value="">
              {projects.state === "ok" ? "Select…" : projects.state === "empty" ? "No projects yet" : "—"}
            </option>
            {projects.state === "ok" &&
              projects.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.status}
                </option>
              ))}
          </select>
        </label>
        <span className="hidden font-data text-[11px] text-nc-lo xl:inline">
          RUN <span className="text-nc-mid">{runId ?? "—"}</span>
        </span>

        <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            disabled={offline}
            spellCheck={false}
            placeholder={offline ? "API offline" : "Launch a run — SMILES or compound name"}
            aria-label="Target molecule"
            className="nc-focus h-7 min-w-0 flex-1 border border-nc-line-strong bg-nc-base px-2 font-data text-[12px] text-nc-hi placeholder:text-nc-lo disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={offline || busy || !target.trim()}
            className="nc-focus flex h-7 items-center gap-1.5 border border-nc-cyan/60 px-3 font-data text-[11px] uppercase tracking-wider text-nc-cyan hover:bg-nc-cyan/10 disabled:cursor-not-allowed disabled:border-nc-line disabled:text-nc-lo disabled:hover:bg-transparent"
          >
            <Play className="h-3 w-3" aria-hidden />
            {busy ? "Starting" : "Run"}
          </button>
          {error && (
            <span role="alert" className="max-w-xs truncate font-data text-[11px] text-nc-bad" title={error}>
              {error}
            </span>
          )}
        </form>

        <ConnectionPill />
      </div>

      <nav aria-label="Lab workspaces" className="flex h-8 items-end gap-1 px-3">
        {TABS.map((t) => {
          const active = t.href === "/lab" ? pathname === "/lab" : t.href === "/dashboard" ? false : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "nc-focus border-b-2 px-3 pb-1.5 font-data text-[11px] uppercase tracking-[0.14em]",
                active ? "border-nc-cyan text-nc-hi" : "border-transparent text-nc-lo hover:text-nc-mid",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
