"use client";

// HOME: ask, or pick up where the last investigation left off.
//
// Everything on this screen is already loaded - the project list the provider holds, and the memories
// this device has seen VESYN recall. It makes no requests of its own, so the first screen of the app is
// the fastest one.
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Brain, Sparkles } from "lucide-react";
import { analyzeImage, dayLabel, jobState, loadSeen, setPendingAsk, type SeenMemory } from "@/lib/mobile/assistant";
import { useNeo, type DemoSnapshot } from "@/lib/store/NeoProvider";
import { readInvestigations } from "@/lib/mobile/cache";
import { AskBar } from "./AskBar";
import { Empty, Row, SimBadge, StatusPill } from "./ui";

const EXAMPLES = [
  "Find a synthesis route for gefitinib",
  "Why was this route rejected?",
  "What did we learn about this reaction?",
  "Profile paracetamol",
];

const STATE_TONE = { completed: "ok", failed: "bad", running: "run", queued: "dim" } as const;

export function Home() {
  const router = useRouter();
  const neo = useNeo();
  const [seen, setSeen] = useState<SeenMemory[]>([]);
  const [saved, setSaved] = useState<DemoSnapshot[]>([]);
  const [cameraNote, setCameraNote] = useState("");

  useEffect(() => { setSeen(loadSeen()); setSaved(readInvestigations()); }, []);

  const sessions = neo.projects.state === "ok" ? neo.projects.data.slice(0, 3) : [];
  // the device's own record of what each investigation recalled, so a card can say so without a request
  const recalledBy = useMemo(() => {
    const by = new Map<string, number>();
    for (const snapshot of saved) {
      const count = snapshot.run.result?.memory?.recalled;
      if (count !== undefined) by.set(snapshot.project.id, count);
    }
    return by;
  }, [saved]);

  const ask = (text: string) => {
    setPendingAsk(text);
    router.push("/assistant/research");
  };

  const open = async (id: string) => {
    await neo.selectProject(id);
    router.push("/assistant/research");
  };

  return (
    <div className="space-y-6">
      <header className="pb-1 pt-3">
        <p className="mb-3 text-[12px] font-medium text-nc-cyan">Research. Remember. Discover.</p>
        <h1 className="max-w-[340px] text-[30px] font-semibold leading-[1.15] tracking-tight text-nc-hi">Your AI research assistant</h1>
        <p className="mt-3 max-w-[440px] text-[14px] leading-relaxed text-nc-mid">
          Seven agents that plan and validate synthesis routes with real chemistry tools — and remember what they learned.
        </p>
      </header>

      <AskBar onAsk={async (text, image) => {
        if (image) { setCameraNote((await analyzeImage(image)).reason); return false; }
        if (text) ask(text);
        return true;
      }} offline={neo.health === "offline"} />
      {cameraNote && <p role="status" className="text-[12px] text-nc-warn">{cameraNote}</p>}
      <Link href="/assistant/research" className="m-chip text-nc-cyan">Explore the guided memory demo →</Link>

      <ul className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <li key={ex}>
            <button type="button" onClick={() => ask(ex)} className="m-chip text-[12px]">
              <Sparkles className="h-3 w-3 shrink-0 text-nc-cyan" aria-hidden />
              {ex}
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="m-continue">
        <div className="mb-2.5 flex items-baseline">
          <h2 id="m-continue" className="m-label">
            Continue research
          </h2>
          <Link href="/assistant/history" className="nc-focus ml-auto rounded-md text-[11.5px] text-nc-cyan">
            All
          </Link>
        </div>
        {sessions.length === 0 ? (
          <Empty
            title={neo.projects.state === "offline" ? "History is not reachable right now." : "Nothing investigated yet."}
            detail={neo.projects.state === "offline" ? undefined : "Ask a question above and the agent team starts work."}
          />
        ) : (
          <ul className="space-y-2">
            {sessions.map((p) => {
              const state = jobState(p);
              const n = recalledBy.get(p.id);
              return (
                <li key={p.id}>
                  <Row
                    onClick={() => void open(p.id)}
                    title={p.name}
                    detail={[dayLabel(p.updated_at), n ? `${n} memor${n === 1 ? "y" : "ies"} recalled` : null].filter(Boolean).join(" · ")}
                    aside={<StatusPill tone={STATE_TONE[state]} live={state === "running"}>{state === "queued" ? "Queued" : state.charAt(0).toUpperCase() + state.slice(1)}</StatusPill>}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="m-recent-memory">
        <div className="mb-2.5 flex items-baseline">
          <h2 id="m-recent-memory" className="m-label">
            Recent memory
          </h2>
          <Link href="/assistant/memory" className="nc-focus ml-auto rounded-md text-[11.5px] text-nc-cyan">
            All
          </Link>
        </div>
        {seen.length === 0 ? (
          <Empty title="Nothing recalled on this device yet." detail="What VESYN recalls during an investigation is collected here." />
        ) : (
          <ul className="space-y-2">
            {seen.slice(0, 2).map((mem) => (
              <li key={mem.id}>
                <Link href="/assistant/memory" className="nc-focus m-card block px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-3.5 w-3.5 shrink-0 text-nc-cyan" aria-hidden />
                    <span className="m-label">{mem.rankedDown.length ? "Changed a ranking" : mem.flagged ? "Flagged transformation" : "Earlier outcome"}</span>
                    <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-nc-lo" aria-hidden />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-nc-mid">
                    {mem.text.split(" | ")[0]}
                    {mem.simulated && <SimBadge />}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
