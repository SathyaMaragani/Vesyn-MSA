"use client";

// VESYN'S EXPERIENCE: what it remembers, and what that memory did.
//
// Memory is only interesting because it changes decisions, so each card leads with the outcome and then
// says what it cost a route. A memory the pipeline could not have produced - a lab result, a chemist's
// preference - is seeded for the demo and tagged; it reads SIMULATED here and nothing dresses it up as
// measured.
//
// These are the memories this device has watched VESYN recall. The bank itself lives in Hindsight and
// the API exposes it only through a run, so this screen grows as investigations are made on this phone.
import React, { useEffect, useMemo, useState } from "react";
import { Brain } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { dayLabel, factOf, loadSeen, provenanceOf, type SeenMemory } from "@/lib/mobile/assistant";
import { useNeo } from "@/lib/store/NeoProvider";
import { Empty, ScreenHeader, SimBadge, Tile, TONE_COLOR } from "./ui";

type Filter = "all" | "applied" | "simulated";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "applied", label: "Changed a ranking" },
  { id: "simulated", label: "Simulated" },
];

function MemoryCard({ mem }: { mem: SeenMemory }) {
  const applied = mem.rankedDown.length > 0;
  const provenance = provenanceOf(mem.text);
  return (
    <li className={cx("m-card px-4 py-3.5", applied && "border-nc-bad/40")}>
      <div className="flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 shrink-0" style={{ color: applied ? TONE_COLOR.bad : TONE_COLOR.run }} aria-hidden />
        <span className="m-label" style={applied ? { color: TONE_COLOR.bad } : undefined}>
          {applied ? "Changed a ranking" : mem.flagged ? "Flagged transformation" : "Earlier outcome"}
        </span>
        {mem.simulated && <SimBadge />}
      </div>

      <p className="mt-2 text-[13px] leading-snug text-nc-hi">{factOf(mem.text)}</p>

      <dl className="mt-3 space-y-1.5 text-[11.5px] leading-snug">
        <div className="flex gap-2">
          <dt className="w-[58px] shrink-0 text-nc-lo">Impact</dt>
          <dd className="min-w-0 flex-1" style={{ color: applied ? TONE_COLOR.bad : "rgb(var(--nc-mid))" }}>
            {applied
              ? `Route${mem.rankedDown.length === 1 ? "" : "s"} ${mem.rankedDown.join(", ")} ranked down — 0.15 of the score per flagged step`
              : "Read and found not to apply to the routes on offer"}
          </dd>
        </div>
        {provenance.length > 0 && (
          <div className="flex gap-2">
            <dt className="w-[58px] shrink-0 text-nc-lo">Source</dt>
            <dd className="min-w-0 flex-1 text-nc-mid">{provenance.join(" · ")}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-[58px] shrink-0 text-nc-lo">Recalled</dt>
          <dd className="min-w-0 flex-1 text-nc-mid">
            {dayLabel(mem.seen)}
            {mem.project ? ` · ${mem.project}` : ""}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function MemoryScreen() {
  const { health } = useNeo();
  const [seen, setSeen] = useState<SeenMemory[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  // re-read on mount: the research screen writes to the same store as runs come in
  useEffect(() => setSeen(loadSeen()), []);

  const counts = useMemo(
    () => ({
      total: seen.length,
      applied: seen.filter((m) => m.rankedDown.length > 0).length,
      simulated: seen.filter((m) => m.simulated).length,
    }),
    [seen],
  );

  const shown = useMemo(
    () =>
      seen.filter((m) => (filter === "applied" ? m.rankedDown.length > 0 : filter === "simulated" ? m.simulated : true)),
    [seen, filter],
  );

  return (
    <div>
      <ScreenHeader
        title="What VESYN remembers"
        sub="Experience from earlier investigations, and what it changed. Memory is not a store of notes — it moves the answer."
      />

      <div className="grid grid-cols-3 gap-2">
        <Tile value={counts.total} label="Experiences remembered" />
        <Tile value={counts.applied} label="Changed a ranking" tone={counts.applied ? "bad" : "ok"} />
        <Tile value={counts.simulated} label="Simulated, for the demo" tone="warn" />
      </div>

      {seen.length > 0 && (
        <ul className="mt-4 flex gap-2">
          {FILTERS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cx("m-chip text-[12px]", filter === f.id && "border-nc-cyan text-nc-cyan")}
              >
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-4 space-y-3">
        {shown.length === 0 ? (
          <li>
            <Empty
              title={seen.length === 0 ? "VESYN has not recalled anything on this device yet." : "Nothing matches that filter."}
              detail={
                seen.length === 0
                  ? health === "offline"
                    ? "Memory is recalled during an investigation; the research service is not reachable right now."
                    : "Ask a research question — what the agents recall from earlier work is collected here."
                  : undefined
              }
            />
          </li>
        ) : (
          shown.map((mem) => <MemoryCard key={mem.id} mem={mem} />)
        )}
      </ul>

      <p className="mt-5 text-[11px] leading-snug text-nc-lo">
        Held in Hindsight, VESYN&apos;s persistent memory. The API exposes the bank through an investigation rather than
        directly, so this list covers the investigations made on this device.
      </p>
    </div>
  );
}
