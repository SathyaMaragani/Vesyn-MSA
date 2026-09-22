"use client";

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AgentInspector } from "./AgentInspector";
import { AgentRail } from "./AgentRail";
import { AlertBanner } from "./AlertBanner";
import { FlightRecorder } from "./FlightRecorder";
import { LabTopBar } from "./LabTopBar";
import { MoleculePanel } from "./MoleculePanel";
import { SimulatedNotice } from "@/components/layout/ConnectionPill";
import { StateNotice, cx } from "@/components/ui/primitives";
import { LabUIProvider, useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";

// three.js loads on demand: the HUD paints first, the world streams in behind it.
const FacilityCanvas = dynamic(() => import("@/components/facility/FacilityCanvas").then((m) => m.FacilityCanvas), {
  ssr: false,
  loading: () => null,
});

const TITLES: Record<string, string> = {
  "/lab/chemistry": "Chemistry workspace",
  "/lab/routes": "Route analysis",
  "/lab/evidence": "Evidence & provenance",
  "/lab/intelligence": "Intelligence — situation brief",
  "/lab/audit": "Flight recorder",
};

/**
 * The lab is one persistent 3D world. Workspaces (/lab/chemistry, ...) open as
 * sheets over it, so the world keeps running behind them; closing a sheet returns
 * to the bare lab. Layouts persist across navigation, so the scene never remounts.
 * The interface is an overlay: H hides all of it and leaves the environment.
 */
export function LabFrame({ children }: { children: React.ReactNode }) {
  return (
    <LabUIProvider>
      <LabLayer>{children}</LabLayer>
    </LabUIProvider>
  );
}

function LabLayer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { health, runId, projects, cursor, setCursor, liveRun, demo } = useNeo();
  const { hudHidden, toggleHud, arrived } = useLabUI();
  const sheetTitle = TITLES[pathname] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return;
      if ((e.key === "h" || e.key === "H") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleHud();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleHud]);

  return (
    <div className="nc-fade-in relative h-screen min-w-[1120px] overflow-hidden bg-nc-base text-nc-hi">
      <FacilityCanvas />
      {/* the room's own darkness at its edges: a vignette, one gradient layer */}
      <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_50%_46%,transparent_52%,rgba(8,9,7,0.55)_100%)]" />

      <div className={cx("transition-[opacity,visibility] duration-[900ms]", hudHidden || !arrived ? "invisible opacity-0" : "visible opacity-100")}>
        <LabTopBar />
        <AgentRail />
        <AgentInspector />
        <MoleculePanel />
        <AlertBanner />
        <FlightRecorder />

        <div className="pointer-events-none absolute left-1/2 top-[99px] z-30 flex w-max max-w-[min(900px,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2">
          <SimulatedNotice className="pointer-events-auto" />
          {cursor !== null && (
            <div role="status" className="pointer-events-auto flex items-center gap-4 border border-nc-warn/60 bg-nc-base/90 px-4 py-2 backdrop-blur-md">
              <span className="font-data text-[11px] tracking-[0.2em] text-nc-warn">REPLAY</span>
              <span className="text-[12px] text-nc-mid">Showing the run as it stood after event #{cursor}. Live is at #{liveRun.lastSeq}.</span>
              <button type="button" onClick={() => setCursor(null)} className="nc-focus border border-nc-cyan/60 px-2.5 py-1 font-data text-[10px] uppercase tracking-wider text-nc-cyan hover:bg-nc-cyan/10">
                Return to live
              </button>
            </div>
          )}
        </div>

        {health === "offline" && !demo && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-nc-base/55">
            <div className="border border-nc-bad/50 bg-nc-base/90">
              <StateNotice
                kind="offline"
                detail="The Vesyn API is unreachable. Agents show as unknown — nothing is simulated. Start the backend and this view reconnects on its own."
              />
            </div>
          </div>
        )}
        {health === "online" && !runId && !sheetTitle && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center">
            <div className="font-data text-[11px] uppercase tracking-[0.2em] text-nc-mid">
              {projects.state === "loading" ? "Loading projects…" : "Laboratory idle"}
            </div>
            <div className="mt-1 text-[12px] text-nc-lo">Launch a run from the command bar to put the workforce to work.</div>
          </div>
        )}

        {sheetTitle && (
          <section
            key={pathname}
            aria-label={sheetTitle}
            className="nc-sheet-in pointer-events-auto absolute bottom-14 left-3 right-14 top-24 z-20 flex flex-col border border-nc-line-strong bg-nc-base/92 backdrop-blur-lg"
          >
            <header className="flex h-9 shrink-0 items-center justify-between border-b border-nc-line px-4">
              <h1 className="font-data text-[11px] uppercase tracking-[0.18em] text-nc-hi">{sheetTitle}</h1>
              <Link href="/lab" aria-label="Close workspace" className="nc-focus text-nc-lo hover:text-nc-hi">
                <X className="h-4 w-4" />
              </Link>
            </header>
            <div data-smooth-scroll className="min-h-0 flex-1 overflow-y-auto">
              {children}
            </div>
          </section>
        )}
      </div>

      {hudHidden && (
        <button
          type="button"
          onClick={toggleHud}
          className="nc-focus absolute bottom-3 left-3 z-30 border border-nc-line-strong bg-nc-base/70 px-2.5 py-1 font-data text-[10px] uppercase tracking-[0.18em] text-nc-lo hover:text-nc-hi"
        >
          Show interface · H
        </button>
      )}
    </div>
  );
}
