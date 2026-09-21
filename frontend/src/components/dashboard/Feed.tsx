"use client";

// LIVE RESEARCH: the run's real events, newest first, straight from the socket (and the API's history). Each row
// is time, agent, what happened, and where to read more. A row that arrives while you watch slides in.
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import type { DashboardModel } from "@/lib/dashboard/model";
import { Dot, Section, TONE_COLOR, clock } from "./ui";

export function Feed({ m, live }: { m: DashboardModel; live: boolean }) {
  // rows newer than the newest one seen at mount are "arriving": they get the entrance
  const first = useRef<number | null>(null);
  const [floor, setFloor] = useState<number | null>(null);
  useEffect(() => {
    if (first.current === null && m.feed.length) {
      first.current = m.feed[0].seq;
      setFloor(first.current);
    }
  }, [m.feed]);

  return (
    <Section label="Live research" index="03" aside={<span className="flex items-center gap-1.5">{live && <Dot tone="ok" pulse />}{live ? "streaming" : m.hasRun ? "history" : "no run"}</span>}>
      {m.feed.length === 0 ? (
        <div className="border border-dashed border-nc-line px-4 py-10 text-center font-data text-[11px] text-nc-lo">{m.hasRun ? "waiting for the first event…" : "No events. Nothing is happening until a run starts."}</div>
      ) : (
        <ol className="max-h-[430px] overflow-y-auto pr-1">
          {m.feed.slice(0, 40).map((f) => (
            <li key={f.seq} className={cx(floor !== null && f.seq > floor && "nc-enter")}>
              <Link href={f.href} className="nc-focus group grid grid-cols-[62px_112px_minmax(0,1fr)_14px] items-baseline gap-3 border-b border-nc-line/70 py-2 hover:bg-nc-panel/50">
                <span className="font-data text-[11px] tabular-nums text-nc-lo">{clock(f.ts)}</span>
                <span className="truncate font-data text-[10px] uppercase tracking-[0.14em] text-nc-mid">{f.agent}</span>
                <span className="min-w-0 truncate text-[12.5px] text-nc-hi" title={f.text}>
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: TONE_COLOR[f.tone] }} />
                  <span className="mr-2 font-data text-[9px] tracking-[0.16em]" style={{ color: TONE_COLOR[f.tone] }}>{f.tag}</span>
                  {f.text}
                </span>
                <ArrowUpRight className="h-3 w-3 self-center text-nc-lo opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
