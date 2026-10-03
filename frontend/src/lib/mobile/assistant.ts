// The assistant's own small model, on top of the data layer the laptop app already has.
//
// Nothing here talks to the backend (lib/api does) and nothing here invents a figure: the reply a phone
// shows is assembled from the evaluator's own recommendation and the checks lib/dashboard/overview.ts
// derives from the run. What IS new is phone-shaped state the backend has no table for - the chat thread
// and the memories seen so far - and that lives in this device's localStorage, nowhere else.
//
// Relative ".ts" imports, like the rest of lib/: the tests load these files directly through tsx.
import type { MemoryPanelView } from "../dashboard/model.ts";
import type { RouteCard, WhyView } from "../dashboard/overview.ts";
import type { Project, RunResult } from "../../types/runs.ts";

// --- types ------------------------------------------------------------------------------------------

export type ChatRole = "user" | "vesyn";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  ts: string;
  /** set on the message that launched a run: its progress and result render beneath it */
  runId?: string;
  /** which agent answered a follow-up question */
  from?: string;
  /** the answer has been asked for and has not arrived */
  pending?: boolean;
  /** a photo the user attached; vision is not wired to a backend yet (see analyzeImage) */
  imageName?: string;
}

/** The short answer a phone leads with. Both parts come from the run; nothing here is composed by an LLM. */
export interface AssistantReply {
  headline: string;
  bullets: { text: string; tone: "ok" | "warn" | "bad"; simulated?: boolean }[];
}

/** A memory this device has seen VESYN recall, kept so the Memory screen spans sessions. */
export interface SeenMemory {
  id: string;
  text: string;
  simulated: boolean;
  flagged: boolean;
  /** route ids this memory ranked down, when it applied */
  rankedDown: number[];
  /** ISO date this device first saw it recalled */
  seen: string;
  /** the investigation it was recalled for */
  project: string | null;
}

export type JobState = "running" | "completed" | "failed" | "queued";

// --- the short answer -------------------------------------------------------------------------------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "5 routes found. I recommend the 2-step route." plus the reasons the evaluator's package supports.
 *
 * `result.recommendation` is the backend's own sentence and is used verbatim whenever there is no route
 * to name - a refusal, or a question that was not a synthesis question.
 */
export function conciseReply(result: RunResult | null, cards: RouteCard[], why: WhyView | null): AssistantReply | null {
  if (!result) return null;
  const rec = cards.find((c) => c.role === "recommended");
  const isRetro = result.task === undefined || result.task === "retrosynthesis";

  if (!isRetro || !rec) {
    return {
      headline: result.recommendation,
      bullets: (result.limitations ?? []).slice(0, 2).map((text) => ({ text, tone: "warn" as const })),
    };
  }

  const headline = `${plural(cards.length, "route")} found. I recommend the ${rec.steps}-step route.`;
  // whyRoute()'s checks, in its order; a phone shows the four that decide it.
  const bullets = (why?.checks ?? rec.checks)
    .filter((c) => c.text)
    .slice(0, 4)
    .map((c) => ({ text: c.text, tone: c.tone, simulated: c.simulated }));
  return { headline, bullets };
}

// --- what a typed line means -------------------------------------------------------------------------

/** A question about the run on screen, or a new investigation to launch. */
export type Ask = "follow-up" | "investigate";

const ABOUT_THE_RUN =
  /^(why|what|how|which|explain|tell me|did|does|do |can you|is |are |was |were |who|when|where|summar|compare|show me why)/i;
const THE_RUN = /\b(this|that|the) (route|step|result|recommendation|answer|decision|run|memory|memories|target|molecule|profile|research|investigation|reaction)\b/i;
const A_NEW_ONE = /\b(find|plan|synthes|retrosynth|route for|profile|solubility|analogues|properties|investigate|analy[sz]e)\b/i;

/**
 * Whether a line is a question about the open run or a new request for the agent team.
 *
 * The backend classifies intent when a run is created (backend/mas/intent.py); this only decides which
 * of the two existing endpoints to use, and the screen says which one it chose and offers the other.
 */
export function classifyAsk(text: string, hasRun: boolean): Ask {
  const t = text.trim();
  if (!hasRun) return "investigate";
  if (/^(continue|resume)\b|\b(alternative|another) route\b/i.test(t) && !/\bfor\s+\w+/i.test(t)) return "follow-up";
  if (A_NEW_ONE.test(t) && !THE_RUN.test(t)) return "investigate";
  if (THE_RUN.test(t) || ABOUT_THE_RUN.test(t)) return "follow-up";
  return "investigate";
}

/**
 * Which agent to put a follow-up to. They answer from their own role and their own events in the run
 * (backend/api/routes_mas.py), so asking the right one is the difference between the reasoning behind a
 * decision and a general answer.
 */
export function agentFor(text: string): string {
  const t = text.toLowerCase();
  if (/\b(remember\w*|memor\w*|learn\w*|experiences?|previous|earlier|last time|flagged)\b/.test(t)) return "critic";
  if (/\b(propert\w*|profile|solubility|analogues?|similar|logp|weight|target|molecules?|compounds?)\b/.test(t)) return "research";
  if (/\b(valid\w*|feasible|precedent|evidence|literature|yields?|conditions?)\b/.test(t)) return "validator";
  if (/\b(step|precursor|starting material|alternative route|another route)\b/.test(t)) return "retro";
  return "evaluator";
}

/** "Memory changed the decision" is only claimable when a recalled lesson actually marked a step. */
export function memoryChangedIt(memory: MemoryPanelView): boolean {
  return (memory.applied?.length ?? 0) > 0;
}

export function jobState(p: Pick<Project, "status">): JobState {
  switch (p.status) {
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "RUNNING":
      return "running";
    default:
      return "queued";
  }
}

/** Today / Yesterday / a date - how the history screen groups sessions. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const dayOf = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000);
  const diff = dayOf(now) - dayOf(d);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Hindsight serialises a fact as "<fact> | When: ... | Involving: ... | <why>". The fact is the lesson. */
export const factOf = (text: string): string => text.split(" | ")[0];

/** Everything after the fact: when it happened, what it involved. Provenance, shown as the source. */
export const provenanceOf = (text: string): string[] => text.split(" | ").slice(1);

/** The critic prefixes a lesson with how often it was flagged; the lesson follows the colon. */
export const lessonOf = (issue: string): string =>
  factOf(issue.replace(/^This transformation was flagged in \d+ earlier investigation\(s\)( \(simulated demo record\))?: /, ""));

// --- this device's own state ------------------------------------------------------------------------
//
// localStorage can throw (private mode, blocked site data) and can come back empty. Every read and
// write is guarded and every caller works without it.

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do: the thread is a convenience, the run itself is on the server */
  }
}

const THREAD = (projectId: string) => `vesyn.thread.${projectId}`;
const MEMORIES = "vesyn.memories";
const DRAFT = "vesyn.draft";

export const loadThread = (projectId: string): ChatMessage[] => {
  const data = read<ChatMessage[]>(THREAD(projectId), []);
  if (!Array.isArray(data)) return [];
  return data.filter((m) => m && typeof m.text === "string").map((m) => m.pending
    ? { ...m, pending: false, text: "The connection was interrupted before the reply arrived. Please ask again." } : m);
};
export const saveThread = (projectId: string, messages: readonly ChatMessage[]): void => write(THREAD(projectId), messages);

export const loadDraft = (): string => { const value = read<string>(DRAFT, ""); return typeof value === "string" ? value : ""; };
export const saveDraft = (text: string): void => write(DRAFT, text);

/**
 * A question asked from the home screen, handed to the research screen to run. sessionStorage, not the
 * URL: it is one hop inside one visit, and it keeps the question out of the address bar.
 */
export function setPendingAsk(text: string): void {
  try {
    window.sessionStorage.setItem("vesyn.ask", text);
  } catch {
    /* the research screen opens with an empty field; the draft is still kept */
  }
}

/** Reads and clears it, so a question runs once. */
export function takePendingAsk(): string | null {
  try {
    const text = window.sessionStorage.getItem("vesyn.ask");
    if (text) window.sessionStorage.removeItem("vesyn.ask");
    return text;
  } catch {
    return null;
  }
}

export const newId = (): string => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * Folds a run's recalled memories into what this device has seen, so the Memory screen covers every
 * investigation made on this phone and not just the open one. Deduped by Hindsight's own id; a memory
 * that applied keeps the routes it ranked down.
 */
export function mergeSeen(
  seen: readonly SeenMemory[],
  memory: MemoryPanelView,
  project: string | null,
  now = new Date(),
): SeenMemory[] {
  const by = new Map(seen.map((m) => [m.id, { ...m, rankedDown: [...m.rankedDown] }]));
  const appliedTo = new Map<string, number[]>();
  for (const a of memory.applied ?? []) {
    const key = lessonOf(a.issue);
    appliedTo.set(key, [...new Set([...(appliedTo.get(key) ?? []), a.routeId])]);
  }
  for (const item of memory.items) {
    const rankedDown = appliedTo.get(factOf(item.text)) ?? [];
    const existing = by.get(item.id);
    if (existing) {
      existing.rankedDown = [...new Set([...existing.rankedDown, ...rankedDown])];
      if (project) existing.project = project;
      continue;
    }
    by.set(item.id, {
      id: item.id,
      text: item.text,
      simulated: item.simulated,
      flagged: item.flagged,
      rankedDown,
      seen: now.toISOString(),
      project,
    });
  }
  // what changed a ranking first, then flagged transformations, then the rest - newest within each
  const rank = (m: SeenMemory) => (m.rankedDown.length ? 0 : m.flagged ? 1 : 2);
  return [...by.values()].sort((a, b) => rank(a) - rank(b) || b.seen.localeCompare(a.seen));
}

export const loadSeen = (): SeenMemory[] => {
  const data = read<SeenMemory[]>(MEMORIES, []);
  return Array.isArray(data) ? data.filter((m) => m && typeof m.id === "string" && typeof m.text === "string" && typeof m.seen === "string" && Array.isArray(m.rankedDown)) : [];
};
export const saveSeen = (items: readonly SeenMemory[]): void => write(MEMORIES, items.slice(0, 200));

// --- capabilities the platform may or may not give us -----------------------------------------------

/**
 * Vision. The backend takes a prompt and a SMILES and has no image endpoint
 * (backend/api/routes_mas.py), so this refuses and says so rather than pretending. To connect one
 * later, post the file there and return the structured request; every caller already handles ok: false.
 */
export async function analyzeImage(_file: File): Promise<{ ok: false; reason: string }> {
  return {
    ok: false,
    reason:
      "VESYN has no vision endpoint yet, so this photo was not sent anywhere. Describe what to look at and the agents will take it from there.",
  };
}

/** A local notification when a run this device started has finished. No push server is involved. */
export function notifyFinished(title: string, body: string): void {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration("/assistant").then((registration) => {
        if (registration) return registration.showNotification(title, { body, icon: "/icons/icon-192.png", tag: "vesyn-run" });
        new Notification(title, { body, icon: "/icons/icon-192.png", tag: "vesyn-run" });
        return undefined;
      }).catch(() => undefined);
    } else new Notification(title, { body, icon: "/icons/icon-192.png", tag: "vesyn-run" });
  } catch {
    /* notifications unavailable: the screen already shows the result */
  }
}
