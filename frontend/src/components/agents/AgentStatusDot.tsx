import React from "react";
import { ACTIVITY_META } from "@/lib/events/activity";
import type { Activity } from "@/types/agents";
import { cx } from "@/components/ui/primitives";

export function AgentStatusDot({ activity, className }: { activity: Activity; className?: string }) {
  const meta = ACTIVITY_META[activity];
  const live = meta.tone === "run" || meta.tone === "warn";
  return (
    <span
      aria-hidden
      className={cx("inline-block h-2 w-2 shrink-0", live && "nc-pulse", activity === "unknown" && "opacity-60", className)}
      style={{ background: activity === "unknown" ? "transparent" : meta.css, border: `1px solid ${meta.css}` }}
    />
  );
}
