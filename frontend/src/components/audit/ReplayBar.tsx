"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, Radio } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";
import type { NeoEvent } from "@/types/events";

const STEP_MS = 800;

/**
 * Replay the investigation. Dragging the slider (or pressing play) re-folds only
 * the events up to that point, so the 3D lab, the agents, the route rack and the
 * molecule show exactly what the system knew then. Nothing is simulated; the end
 * of the slider is live.
 */
export function ReplayBar({ lane }: { lane: NeoEvent[] }) {
  const { cursor, setCursor } = useNeo();
  const { focusAgent } = useLabUI();
  const [playing, setPlaying] = useState(false);
  const n = lane.length;
  const k = cursor === null ? n : lane.filter((e) => e.seq <= cursor).length;
  const kRef = useRef(k);
  kRef.current = k;

  const seek = (idx: number, fly = false) => {
    if (idx >= n) {
      setCursor(null);
      return;
    }
    setCursor(idx <= 0 ? (lane[0]?.seq ?? 1) - 1 : lane[idx - 1].seq);
    const ev = idx > 0 ? lane[idx - 1] : null;
    if (fly && ev?.agent_id) focusAgent(ev.agent_id);
  };

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = kRef.current + 1;
      if (next >= n) {
        setCursor(null);
        setPlaying(false);
      } else seek(next, true);
    }, STEP_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, n]);

  if (n === 0) return null;
  const at = k > 0 ? lane[Math.min(k, n) - 1] : null;

  return (
    <div className="flex items-center gap-3 border-b border-nc-line bg-nc-base/70 px-4 py-2">
      <button
        type="button"
        onClick={() => {
          if (!playing && cursor === null) seek(0);
          setPlaying((p) => !p);
        }}
        aria-label={playing ? "Pause replay" : "Replay from the start"}
        className="nc-focus flex h-7 w-7 items-center justify-center border border-nc-line-strong text-nc-hi hover:border-nc-cyan"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={n}
        value={k}
        onChange={(e) => {
          setPlaying(false);
          seek(Number(e.target.value), true);
        }}
        aria-label="Replay position"
        className="h-1 flex-1 accent-[rgb(34,211,238)]"
      />
      <span className="w-64 truncate font-data text-[11px] text-nc-mid">
        {cursor === null ? (
          <span className="text-nc-ok">LIVE · {n} events</span>
        ) : (
          <>
            REPLAY · {k} of {n}
            {at ? <span className="text-nc-lo"> · #{at.seq} {at.type}</span> : <span className="text-nc-lo"> · before the run</span>}
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => {
          setPlaying(false);
          setCursor(null);
        }}
        disabled={cursor === null}
        className={cx(
          "nc-focus flex h-7 items-center gap-1.5 border px-2.5 font-data text-[10px] uppercase tracking-wider",
          cursor === null ? "border-nc-line text-nc-lo" : "border-nc-cyan/60 text-nc-cyan hover:bg-nc-cyan/10",
        )}
      >
        <Radio className="h-3 w-3" aria-hidden />
        Return to live
      </button>
    </div>
  );
}
