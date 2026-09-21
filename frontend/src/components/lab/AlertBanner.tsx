"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { TONE_BORDER, TONE_TEXT, cx } from "@/components/ui/primitives";
import { latestAlert } from "@/lib/events/attention";
import { useLabUI } from "@/lib/store/LabUI";
import { useNeo } from "@/lib/store/NeoProvider";

/**
 * A contextual panel for the one thing worth stopping for. INSPECT flies the
 * camera to the responsible workstation and opens the workspace that holds the detail.
 */
export function AlertBanner() {
  const router = useRouter();
  const { run } = useNeo();
  const { dismissedAlert, dismissAlert, focusAgent } = useLabUI();
  const alert = useMemo(() => latestAlert(run), [run]);

  if (!alert || alert.seq <= dismissedAlert) return null;
  const tone = alert.tone === "ok" ? "ok" : alert.tone;

  return (
    <div
      role="alert"
      className={cx(
        "pointer-events-auto absolute right-14 top-[5.2rem] z-20 w-[26rem] max-w-[calc(100vw-40rem)] border bg-nc-base/80 backdrop-blur-md",
        TONE_BORDER[tone],
      )}
    >
      <div className="flex items-start gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className={cx("font-data text-[11px] tracking-[0.18em]", TONE_TEXT[tone])}>{alert.title}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-nc-mid">{alert.detail}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            focusAgent(alert.agentId);
            router.push(alert.href);
          }}
          className={cx("nc-focus h-7 shrink-0 border px-3 font-data text-[11px] uppercase tracking-wider hover:bg-nc-panel-2", TONE_BORDER[tone], TONE_TEXT[tone])}
        >
          Inspect
        </button>
        <button type="button" onClick={() => dismissAlert(alert.seq)} aria-label="Dismiss" className="nc-focus text-nc-lo hover:text-nc-hi">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
