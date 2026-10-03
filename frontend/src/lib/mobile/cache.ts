import type { DemoSnapshot } from "../store/NeoProvider";

const KEY = "vesyn.investigations.v1";

export function isSnapshot(value: unknown): value is DemoSnapshot {
  if (!value || typeof value !== "object") return false;
  const d = value as DemoSnapshot;
  return typeof d.project?.id === "string" && typeof d.run?.id === "string" &&
    d.run.project_id === d.project.id && Array.isArray(d.events) &&
    Array.isArray(d.agents) && Array.isArray(d.tools) && !!d.graph;
}

/** Explicit, labelled offline copies; never an HTTP response cache for live scientific results. */
export function readInvestigations(): DemoSnapshot[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(data) ? data.filter(isSnapshot).slice(0, 8) : [];
  } catch { return []; }
}

export function saveInvestigation(snapshot: DemoSnapshot): void {
  const items = [snapshot, ...readInvestigations().filter((d) => d.project.id !== snapshot.project.id)].slice(0, 8);
  // Storage quotas vary on phones. Keep as many of the newest investigations as will fit.
  while (items.length) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); return; }
    catch { items.pop(); }
  }
}
