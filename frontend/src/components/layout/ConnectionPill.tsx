"use client";

import React from "react";
import { cx } from "@/components/ui/primitives";
import { useNeo } from "@/lib/store/NeoProvider";

/**
 * The one indicator of whether what you are looking at is live. It is derived
 * from real state only: the health poll, the socket, and whether a recording is shown.
 */
export function ConnectionPill() {
  const { health, socket, runId, demo } = useNeo();

  let label: string;
  let mark: string;
  let tone: string;
  let pulse = false;

  if (demo) {
    label = "SIMULATED · API OFFLINE";
    mark = "◇";
    tone = "text-nc-warn border-nc-warn/50";
  } else if (health === "checking") {
    label = "CONNECTING";
    mark = "◌";
    tone = "text-nc-mid border-nc-line-strong";
    pulse = true;
  } else if (health === "offline") {
    label = "API OFFLINE";
    mark = "×";
    tone = "text-nc-bad border-nc-bad/50";
  } else if (!runId) {
    label = "API ONLINE · NO RUN";
    mark = "●";
    tone = "text-nc-mid border-nc-line-strong";
  } else if (socket === "live") {
    label = "LIVE";
    mark = "●";
    tone = "text-nc-ok border-nc-ok/50";
  } else if (socket === "reconnecting") {
    label = "RECONNECTING";
    mark = "○";
    tone = "text-nc-warn border-nc-warn/50";
    pulse = true;
  } else {
    label = "CONNECTING";
    mark = "◌";
    tone = "text-nc-cyan border-nc-cyan/50";
    pulse = true;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx("flex h-6 items-center gap-1.5 border px-2 font-data text-[11px] tracking-wider", tone)}
    >
      <span className={cx(pulse && "nc-pulse")}>{mark}</span>
      <span>{label}</span>
    </div>
  );
}

/** What a viewer must not miss while the recording is shown: none of it is live. */
export function SimulatedNotice({ className }: { className?: string }) {
  const { demo } = useNeo();
  if (!demo) return null;
  const when = new Date(demo.run.finished_at ?? demo.run.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div role="status" className={cx("flex items-center gap-4 border border-nc-warn/60 bg-nc-base/90 px-4 py-1.5 backdrop-blur-md", className)}>
      <span className="font-data text-[11px] tracking-[0.2em] text-nc-warn">SIMULATED</span>
      <span className="text-[12px] text-nc-mid">
        API offline &mdash; showing a recorded run, not live data: &ldquo;{demo.project.name}&rdquo;, {when}.
      </span>
    </div>
  );
}
