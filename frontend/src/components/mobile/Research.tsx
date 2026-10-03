"use client";

// RESEARCH: the conversation. The most important screen, and the only one that starts work.
//
// A line typed here is one of two things, and the screen says which it chose: a new investigation,
// which launches the agent team (POST /api/projects, the same call the laptop app makes), or a question
// about the investigation on screen, which goes to the agent whose role covers it. Nothing is answered
// locally: the short reply under a result is assembled from the evaluator's own package.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, ChevronDown, GitBranch, HelpCircle, Sparkles } from "lucide-react";
import { shownRoute } from "@/components/facility/facilityState";
import { askAgent } from "@/lib/api";
import { buildDashboard } from "@/lib/dashboard/model";
import { routeCards, whyRoute } from "@/lib/dashboard/overview";
import { cx } from "@/components/ui/primitives";
import {
  agentFor,
  analyzeImage,
  classifyAsk,
  conciseReply,
  factOf,
  lessonOf,
  loadSeen,
  loadThread,
  mergeSeen,
  newId,
  provenanceOf,
  saveSeen,
  saveThread,
  takePendingAsk,
  type ChatMessage,
} from "@/lib/mobile/assistant";
import { useNeo, useRunResult } from "@/lib/store/NeoProvider";
import { useServices } from "@/components/dashboard/useServices";
import { AgentProgress } from "./AgentProgress";
import { AskBar } from "./AskBar";
import { RouteList } from "./RouteList";
import { DemoStory } from "./DemoStory";
import { CheckRow, Empty, SimBadge, TONE_COLOR } from "./ui";

/** "3 previous experiences recalled" - tap for what each one was and what it did to the ranking. */
function MemoryRecall({
  recalled,
  items,
  applied,
}: {
  /** what the run reported recalling. The backend ships a capped list of the memories themselves,
   *  so items.length understates it - 12 shown of 16 recalled, on the demo snapshot. */
  recalled: number | null;
  items: { id: string; text: string; simulated: boolean; flagged: boolean }[];
  applied: { routeId: number; issue: string; simulated: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const changed = useMemo(() => {
    const by = new Map<string, { text: string; simulated: boolean; routes: number[] }>();
    for (const a of applied) {
      const key = lessonOf(a.issue);
      const g = by.get(key) ?? { text: key, simulated: a.simulated, routes: [] };
      if (!g.routes.includes(a.routeId)) g.routes.push(a.routeId);
      by.set(key, g);
    }
    return [...by.values()];
  }, [applied]);

  if (items.length === 0 && changed.length === 0) return null;

  return (
    <div className={cx("m-card mt-2 overflow-hidden", changed.length > 0 && "m-memory-pulse")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="nc-focus flex min-h-[48px] w-full items-center gap-2.5 px-3.5 text-left"
      >
        <Brain className="h-4 w-4 shrink-0 text-nc-cyan" aria-hidden />
        <span className="min-w-0 flex-1 text-[12.5px] text-nc-hi">
          {changed.length > 0
            ? `${changed.length} previous experience${changed.length === 1 ? "" : "s"} changed the ranking`
            : `${recalled ?? items.length} previous experience${(recalled ?? items.length) === 1 ? "" : "s"} recalled, none applied`}
        </span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 text-nc-lo transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="border-t border-nc-line px-3.5 py-3">
          {changed.map((g, i) => (
            <div key={g.text} className={cx(i > 0 && "mt-3 border-t border-nc-line/60 pt-3")}>
              <div className="m-label">Experience {i + 1}</div>
              <p className="mt-1 text-[12px] leading-snug text-nc-mid">
                {g.text}
                {g.simulated && <SimBadge />}
              </p>
              <p className="mt-1.5 text-[11px] leading-snug" style={{ color: TONE_COLOR.bad }}>
                Impact · route{g.routes.length === 1 ? "" : "s"} {g.routes.join(", ")} ranked down
              </p>
            </div>
          ))}

          {items.length > 0 && (
            <details className="mt-3">
              <summary className="nc-focus m-label cursor-pointer py-1">
                Recalled ({items.length}{recalled !== null && recalled > items.length ? ` of ${recalled} shown` : ""})
              </summary>
              <ul className="mt-2 space-y-2">
                {items.map((it) => (
                  <li key={it.id} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: it.flagged ? TONE_COLOR.warn : "rgb(var(--nc-line-strong))" }}
                    />
                    <p className="text-[11.5px] leading-snug text-nc-mid">
                      {factOf(it.text)}
                      {it.simulated && <SimBadge />}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-3 text-[10.5px] leading-snug text-nc-lo">
            Recalled from VESYN&apos;s research memory (Hindsight). A memory marked SIMULATED is seeded demo history, not a
            measurement.
          </p>
        </div>
      )}
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const mine = msg.role === "user";
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          mine ? "bg-nc-cyan/[0.14] text-nc-hi" : "m-card text-nc-mid",
        )}
      >
        {!mine && msg.from && <div className="m-label mb-1">{msg.from}</div>}
        {msg.pending ? <span className="nc-pulse font-data text-[12px]">Thinking…</span> : <span className="whitespace-pre-wrap">{msg.text}</span>}
        {msg.imageName && <div className="mt-1.5 font-data text-[10.5px] text-nc-lo">📎 {msg.imageName}</div>}
      </div>
    </div>
  );
}

export function Research() {
  const neo = useNeo();
  return <><DemoStory /><Conversation key={neo.projectId ?? "new"} /></>;
}

function Conversation() {
  const neo = useNeo();
  const result = useRunResult();
  const services = useServices();
  const project = neo.projects.state === "ok" ? (neo.projects.data.find((p) => p.id === neo.projectId) ?? null) : null;

  const m = useMemo(
    () => buildDashboard({ run: neo.run, result, agents: neo.agents, project, services }),
    [neo.run, result, neo.agents, project, services],
  );
  const routes = useMemo(() => routeCards(result, m.target.name), [result, m.target.name]);
  const why = useMemo(() => whyRoute(result, routes), [result, routes]);
  const reply = useMemo(() => conciseReply(result, routes, why), [result, routes, why]);

  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [showDecision, setShowDecision] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const projectId = neo.projectId;

  // The thread for the open investigation. Its first line is the prompt the backend stored, so a session
  // reopened from History reads as the conversation it was.
  useEffect(() => {
    if (!projectId) {
      setThread([]);
      return;
    }
    const stored = loadThread(projectId);
    if (stored.length) {
      setThread(stored);
      return;
    }
    const opening = project?.name ?? project?.target_query ?? null;
    setThread(
      opening
        ? [{ id: newId(), role: "user", text: opening, ts: project?.created_at ?? new Date().toISOString(), runId: neo.runId ?? undefined }]
        : [],
    );
    // project is read for its stored prompt only; the thread is keyed by the project id
  }, [projectId, project?.name, project?.target_query, project?.created_at, neo.runId]);

  useEffect(() => {
    if (projectId && thread.length) saveThread(projectId, thread);
  }, [projectId, thread]);

  // Do not scroll past the demo controls and result when opening an existing investigation.

  // Every run's recall is folded into what this device has seen, so the Memory screen spans sessions.
  const recalled = m.memory.items.length;
  useEffect(() => {
    if (!m.memory.reported || recalled === 0) return;
    saveSeen(mergeSeen(loadSeen(), m.memory, project?.name ?? null));
  }, [m.memory, recalled, project?.name]);

  const ask = useCallback(
    async (text: string, image?: File) => {
      if (neo.demoStage) {
        setNote("This is a recorded demo. Use the recall button to compare, or exit the demo to ask VESYN live.");
        return false;
      }
      const now = new Date().toISOString();
      if (image) {
        const vision = await analyzeImage(image);
        setThread((t) => [
          ...t,
          { id: newId(), role: "user", text: text || "What is this?", ts: now, imageName: image.name },
          { id: newId(), role: "vesyn", text: vision.reason, ts: now, from: "VESYN" },
        ]);
        return true;
      }
      if (!text) return;

      const kind = classifyAsk(text, neo.runId !== null && m.hasRun);

      if (kind === "investigate") {
        setBusy(true);
        const r = await neo.launch(text);
        setBusy(false);
        if (r.status === "ok") {
          // launch() selects the new project; its thread opens with this question
          const id = newId();
          saveThread(r.data.project.id, [{ id, role: "user", text, ts: now, runId: r.data.run?.id ?? undefined }]);
          setShowRoutes(false);
          setNote(null);
          return true;
        }
        setThread((t) => [
          ...t,
          { id: newId(), role: "user", text, ts: now },
          {
            id: newId(),
            role: "vesyn",
            text:
              r.status === "offline"
                ? "VESYN could not reach the research service. Your question is saved — try again when you are back online."
                : "The research service could not start this investigation. Your question is kept below; please try again.",
            ts: now,
            from: "VESYN",
          },
        ]);
        return false;
      }

      const agent = agentFor(text);
      setBusy(true);
      const pendingId = newId();
      setThread((t) => [
        ...t,
        { id: newId(), role: "user", text, ts: now },
        { id: pendingId, role: "vesyn", text: "", ts: now, pending: true, from: agent },
      ]);
      setNote(`Asked the ${agent} about this investigation. Ask to “find” or “plan” something to start a new one.`);
      const r = await askAgent(agent, text, neo.runId);
      setBusy(false);
      setThread((t) =>
        t.map((msg) =>
          msg.id === pendingId
            ? {
                ...msg,
                pending: false,
                text:
                  r.status === "ok"
                    ? r.data.source === "llm" ? r.data.reply : "The language model is unavailable, so VESYN cannot answer this follow-up right now. Your investigation and question are saved; try again when the model is connected."
                    : r.status === "offline"
                      ? "VESYN could not be reached. This investigation is saved — ask again when you are back online."
                      : "VESYN could not answer just now. Your question is kept below; please try again.",
                from: r.status === "ok" ? r.data.name : "VESYN",
              }
            : msg,
        ),
      );
      return r.status === "ok" && r.data.source === "llm";
    },
    [neo, m.hasRun],
  );

  // A question asked from the home screen runs here, once the provider has settled - so that a question
  // about an earlier investigation is read as a follow-up and not as a new one.
  const settled = neo.projects.state !== "loading";
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current || !settled) return;
    const pending = takePendingAsk();
    if (!pending) {
      handed.current = true;
      return;
    }
    handed.current = true;
    void ask(pending);
  }, [settled, ask]);

  const running = m.phase === "running";
  const hasResult = result !== null;
  const top = shownRoute(result);

  return (
    <div className="flex min-h-[calc(100svh-var(--m-bar)-var(--m-nav)-3rem)] flex-col">
      <div className="min-h-0 flex-1 space-y-3">
        {thread.length === 0 && !m.hasRun && (
          <Empty
            title="Ask VESYN a research question."
            detail="“Find a synthesis route for gefitinib”, “Why was this route rejected?”, “What did we learn about this reaction?”"
          />
        )}

        {thread.map((msg) => (
          <Bubble key={msg.id} msg={msg} />
        ))}

        {m.hasRun && (
          <section aria-label="Investigation" className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-nc-cyan" aria-hidden />
              <h2 className="m-label">
                {m.target.name ?? m.projectName ?? "Investigation"}
                {running ? " · working" : m.phase === "failed" ? " · failed" : ""}
              </h2>
            </div>

            {(running || !hasResult) && <AgentProgress m={m} />}

            {m.phase === "failed" && (
              <p className="m-card px-3.5 py-3 text-[12.5px] leading-snug" style={{ color: TONE_COLOR.bad }}>
                This run failed. {m.alerts.find((a) => a.key === "run-failed")?.detail ?? "No reason was reported."}
              </p>
            )}

            {hasResult && reply && (
              <>
                <div className="m-card px-3.5 py-3">
                  <p className="text-[14px] font-medium leading-snug text-nc-hi">{reply.headline}</p>
                  {reply.bullets.length > 0 && (
                    <>
                      <div className="m-label mt-2.5">Why</div>
                      <ul className="mt-1.5 space-y-1.5">
                        {reply.bullets.map((b, i) => (
                          <CheckRow key={`${b.text}-${i}`} tone={b.tone} text={b.text} simulated={b.simulated} size="sm" />
                        ))}
                      </ul>
                    </>
                  )}
                  {top && (
                    <p className="mt-2.5 font-data text-[10.5px] text-nc-lo">
                      score {top.score.toFixed(4)} · {top.number_of_reactions} step{top.number_of_reactions === 1 ? "" : "s"} · report by{" "}
                      {result?.report_source?.startsWith("llm") ? result.report_source.replace(/^llm:/, "") : "template"}
                    </p>
                  )}
                </div>

                <MemoryRecall recalled={m.memory.recalled} items={m.memory.items} applied={m.memory.applied ?? []} />

                <div className="flex flex-wrap gap-2">
                  {routes.length > 0 && (
                    <button type="button" onClick={() => setShowRoutes((v) => !v)} className="m-chip">
                      <GitBranch className="h-3.5 w-3.5 text-nc-cyan" aria-hidden />
                      {showRoutes ? "Hide routes" : `View routes (${routes.length})`}
                    </button>
                  )}
                  <button type="button" onClick={() => setShowDecision(true)} className="m-chip">
                    <HelpCircle className="h-3.5 w-3.5 text-nc-cyan" aria-hidden />
                    Why this decision?
                  </button>
                </div>

                {/* one mount: the cards fold away, the sheets stay reachable from the chips */}
                <div className={showRoutes ? "pt-1" : undefined}>
                  <RouteList
                    routes={routes}
                    why={why}
                    m={m}
                    showCards={showRoutes}
                    openDecision={showDecision}
                    onDecisionClose={() => setShowDecision(false)}
                  />
                </div>
              </>
            )}
          </section>
        )}

        {note && (
          <p role="status" className="text-[11px] leading-snug text-nc-lo">
            {note}
          </p>
        )}
        <div ref={bottom} />
      </div>

      {!neo.demoStage && <div className="sticky bottom-[calc(var(--m-nav)+env(safe-area-inset-bottom)+0.5rem)] z-20 mt-3 rounded-2xl bg-nc-base pt-2">
        <AskBar onAsk={ask} busy={busy || !!neo.demoStage} offline={neo.health === "offline"} dock placeholder={neo.demoStage ? "Exit demo to ask VESYN live" : m.hasRun ? "Ask about this, or start something new…" : "Ask VESYN anything…"} />
      </div>}
    </div>
  );
}
