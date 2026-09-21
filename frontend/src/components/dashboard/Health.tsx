"use client";

// SYSTEM HEALTH and ALERTS. Health is what each service actually answered (see lib/dashboard/services.ts): a
// failed service shows the backend's own reason, and INSPECT reveals the endpoint and the full message. Alerts are the
// few things a chemist should look at, in restrained copper; nothing is a banner.
import React, { useState } from "react";
import Link from "next/link";
import type { Alert } from "@/lib/dashboard/model";
import type { ServiceState, ServiceStatus } from "@/lib/dashboard/services";
import { cx } from "@/components/ui/primitives";
import type { Tone } from "@/lib/events/activity";
import { Dot, Section, TONE_COLOR } from "./ui";

const TONE_OF: Record<ServiceState, Tone> = { online: "ok", checking: "dim", idle: "dim", warn: "warn", offline: "bad", error: "bad" };

export function Health({ services }: { services: readonly ServiceStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const bad = services.filter((s) => s.state === "offline" || s.state === "error").length;
  return (
    <Section label="System health" index="09" aside={<span style={{ color: bad ? TONE_COLOR.bad : undefined }}>{bad ? `${bad} unavailable` : "all reachable services answering"}</span>}>
      <ul>
        {services.map((s) => {
          const tone = TONE_OF[s.state];
          const problem = s.state === "offline" || s.state === "error" || s.state === "warn";
          return (
            <li key={s.id} className="border-b border-nc-line/70">
              <div className="grid grid-cols-[minmax(0,1fr)_140px_60px] items-center gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-data text-[11px] uppercase tracking-[0.14em] text-nc-hi">{s.label}</div>
                  {s.detail && <div className={cx("mt-0.5 truncate font-data text-[10px]", problem ? "text-nc-mid" : "text-nc-lo")} title={s.detail}>{s.state === "offline" || s.state === "error" ? `Reason: ${s.detail}` : s.detail}</div>}
                </div>
                <span className="flex items-center gap-2 font-data text-[10px] uppercase tracking-[0.14em]" style={{ color: TONE_COLOR[tone] }}>
                  <Dot tone={tone} pulse={s.state === "checking"} /> {s.word}
                </span>
                {problem ? (
                  <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="nc-focus border border-nc-line-strong px-2 py-0.5 font-data text-[9px] uppercase tracking-[0.16em] text-nc-mid hover:border-nc-cyan/60 hover:text-nc-hi">
                    Inspect
                  </button>
                ) : (
                  <span />
                )}
              </div>
              {open === s.id && (
                <div className="mb-2 border-l-2 bg-nc-panel/50 px-3 py-2 font-data text-[10px] leading-relaxed text-nc-mid" style={{ borderColor: TONE_COLOR[tone] }}>
                  <div><span className="text-nc-lo">ENDPOINT </span>{s.source}</div>
                  <div className="mt-0.5 break-words"><span className="text-nc-lo">ANSWER </span>{s.detail ?? "no message"}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function Alerts({ alerts }: { alerts: readonly Alert[] }) {
  return (
    <Section label="Alerts" index="10" aside={<span>{alerts.length ? `${alerts.length} to review` : "none"}</span>}>
      {alerts.length === 0 ? (
        <div className="border border-dashed border-nc-line px-4 py-6 font-data text-[11px] text-nc-lo">Nothing needs attention.</div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const body = (
              <div className="border-l-2 py-1 pl-3" style={{ borderColor: a.tone === "bad" ? TONE_COLOR.bad : TONE_COLOR.warn }}>
                <div className="font-data text-[10px] uppercase tracking-[0.16em]" style={{ color: a.tone === "bad" ? TONE_COLOR.bad : TONE_COLOR.warn }}>{a.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-nc-mid">{a.detail}</div>
              </div>
            );
            return <li key={a.key}>{a.href ? <Link href={a.href} className="nc-focus block hover:bg-nc-panel/50">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </Section>
  );
}
