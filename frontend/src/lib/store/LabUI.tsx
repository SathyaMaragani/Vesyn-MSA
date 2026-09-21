"use client";

// View state for the lab that is NOT backend data: what is selected, where the camera is aimed, which
// alert the user dismissed, whether the arrival is over. The camera has six ways of being pointed:
//   FREE VIEW      the user has taken the camera (dragging, panning, zooming)
//   OVERVIEW       the whole facility (and FLOW: straight down on the conduits)
//   FOLLOW         the camera goes to whichever department the backend says is working
//   FOCUS AGENT    a department (click it, or press its number)
//   FOCUS MOLECULE the molecular core, close
//   FOCUS ROUTE    the route table in the retrosynthesis hall
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type CameraMode = "free" | "follow";
export type Focus = { kind: "agent"; id: string } | { kind: "core" } | { kind: "molecule" } | { kind: "route" } | null;
export type ViewPreset = "overview" | "flow" | "free";

interface LabUIValue {
  selectedId: string | null;
  select: (id: string | null) => void;
  mode: CameraMode;
  setMode: (m: CameraMode) => void;
  focus: Focus;
  focusAgent: (id: string) => void;
  focusCore: () => void;
  focusMolecule: () => void;
  focusRoute: () => void;
  preset: ViewPreset;
  setPreset: (p: ViewPreset) => void;
  /** The user took the camera: leave every automatic view. */
  goFree: () => void;
  dismissedAlert: number;
  dismissAlert: (seq: number) => void;
  /** Atom / bond of the target molecule under inspection (indices into the parsed graph). */
  selectedAtom: number | null;
  selectAtom: (i: number | null) => void;
  selectedBond: number | null;
  selectBond: (i: number | null) => void;
  /** H toggles the overlay so the environment can be seen unobstructed. */
  hudHidden: boolean;
  toggleHud: () => void;
  /** The cinematic arrival has finished (or was skipped): the interface may appear. */
  arrived: boolean;
  setArrived: (v: boolean) => void;
  /** The flight recorder dock is expanded. */
  recorderOpen: boolean;
  setRecorderOpen: (v: boolean) => void;
}

const Ctx = createContext<LabUIValue | null>(null);

export function LabUIProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setModeState] = useState<CameraMode>("free");
  const [focus, setFocus] = useState<Focus>(null);
  const [preset, setPresetState] = useState<ViewPreset>("overview");
  const [dismissedAlert, setDismissed] = useState(0);
  const [selectedAtom, setSelectedAtom] = useState<number | null>(null);
  const [selectedBond, setSelectedBond] = useState<number | null>(null);
  const [hudHidden, setHudHidden] = useState(false);
  const [arrived, setArrivedState] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const selectAtom = useCallback((i: number | null) => {
    setSelectedAtom(i);
    if (i !== null) setSelectedBond(null);
  }, []);
  const selectBond = useCallback((i: number | null) => {
    setSelectedBond(i);
    if (i !== null) setSelectedAtom(null);
  }, []);
  const toggleHud = useCallback(() => setHudHidden((h) => !h), []);
  const setArrived = useCallback((v: boolean) => setArrivedState(v), []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setFocus(id ? { kind: "agent", id } : null);
    if (id) setModeState("free");
  }, []);
  const setMode = useCallback((m: CameraMode) => {
    setModeState(m);
    if (m === "follow") setFocus(null);
  }, []);
  const focusAgent = useCallback((id: string) => {
    setSelectedId(id);
    setFocus({ kind: "agent", id });
    setModeState("free");
  }, []);
  const focusCore = useCallback(() => {
    setSelectedId(null);
    setFocus({ kind: "core" });
    setModeState("free");
  }, []);
  const focusMolecule = useCallback(() => {
    setSelectedId(null);
    setFocus({ kind: "molecule" });
    setModeState("free");
  }, []);
  const focusRoute = useCallback(() => {
    setSelectedId("retro");
    setFocus({ kind: "route" });
    setModeState("free");
  }, []);
  const setPreset = useCallback((p: ViewPreset) => {
    setPresetState(p);
    setFocus(null);
    setSelectedId(null);
    setModeState("free");
  }, []);
  const goFree = useCallback(() => {
    setPresetState("free");
    setFocus(null);
    setModeState("free");
  }, []);
  const dismissAlert = useCallback((seq: number) => setDismissed(seq), []);

  const value = useMemo(
    () => ({
      selectedId,
      select,
      mode,
      setMode,
      focus,
      focusAgent,
      focusCore,
      focusMolecule,
      focusRoute,
      preset,
      setPreset,
      goFree,
      dismissedAlert,
      dismissAlert,
      selectedAtom,
      selectAtom,
      selectedBond,
      selectBond,
      hudHidden,
      toggleHud,
      arrived,
      setArrived,
      recorderOpen,
      setRecorderOpen,
    }),
    [selectedId, select, mode, setMode, focus, focusAgent, focusCore, focusMolecule, focusRoute, preset, setPreset, goFree, dismissedAlert, dismissAlert, selectedAtom, selectAtom, selectedBond, selectBond, hudHidden, toggleHud, arrived, setArrived, recorderOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLabUI(): LabUIValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLabUI must be used inside <LabUIProvider>");
  return v;
}
