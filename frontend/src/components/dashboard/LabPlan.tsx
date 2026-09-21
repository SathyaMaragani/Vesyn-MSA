"use client";

// LAB STATUS: the facility as a drawing. The departments stand where they stand in the 3D lab (same plan, same
// coordinates) and are coloured by what the backend says each agent is doing right now. It is a schematic in a
// frame, not an embedded scene: the lab stays on its own page.
import React from "react";
import { ArrowRight } from "lucide-react";
import { ZONE_LIST, yawOf } from "@/components/facility/layout";
import type { DashboardModel } from "@/lib/dashboard/model";
import { Section, TONE_COLOR } from "./ui";
import { useEnterLab } from "./DashboardFrame";

// the support buildings (architecture, no data): compute hall, sample archive, instrument bay, analytical bay
const SUPPORT: { x0: number; x1: number; z0: number; z1: number; name: string }[] = [
  { x0: -44, x1: -17, z0: -36.5, z1: -15, name: "COMPUTE" },
  { x0: 17, x1: 44, z0: -36.5, z1: -15, name: "ARCHIVE" },
  { x0: -44, x1: -34, z0: 10, z1: 44, name: "" },
  { x0: 34, x1: 44, z0: 10, z1: 44, name: "" },
];

export function LabPlan({ m }: { m: DashboardModel }) {
  const enter = useEnterLab();
  const byId = new Map(m.agents.map((a) => [a.id, a]));
  const working = m.agents.filter((a) => a.tone === "run" || a.tone === "warn").length;
  const coreTone = !m.hasRun ? "dim" : m.phase === "failed" ? "bad" : m.phase === "completed" ? "ok" : "run";

  return (
    <Section label="Lab status" index="05" aside={<span>{m.hasRun ? `${working} of ${m.agents.length} working` : "facility idle"}</span>}>
      <button type="button" onClick={(e) => enter({ x: e.clientX, y: e.clientY })} aria-label="Enter the lab" className="nc-focus group relative block w-full overflow-hidden border border-nc-line bg-nc-base text-left transition-colors hover:border-nc-cyan/50">
        <svg viewBox="-52 -44 104 97" className="block w-full" role="img" aria-label="Plan of the facility, coloured by agent state">
          <defs>
            <radialGradient id="lp-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#d6a45b" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#d6a45b" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x={-50} y={-42} width={100} height={92} fill="none" stroke="rgb(84 84 73)" strokeWidth={0.35} />
          {SUPPORT.map((s, i) => (
            <g key={i} opacity={0.75}>
              <rect x={s.x0} y={s.z0} width={s.x1 - s.x0} height={s.z1 - s.z0} fill="rgb(35 36 31)" stroke="rgb(54 55 48)" strokeWidth={0.3} />
              {s.name && <text x={(s.x0 + s.x1) / 2} y={(s.z0 + s.z1) / 2 + 1} fontSize={2.4} textAnchor="middle" fill="rgb(84 84 73)" fontFamily="var(--nc-font-data)" letterSpacing={0.3}>{s.name}</text>}
            </g>
          ))}
          <circle r={17.9} fill="none" stroke="rgb(54 55 48)" strokeWidth={0.3} />
          <circle r={13.2} fill="none" stroke="rgb(54 55 48)" strokeWidth={0.2} />
          <circle r={22} fill="url(#lp-core)" />
          {/* the gallery: an arc open to the south */}
          <path d="M 5.9 8.2 A 10.1 10.1 0 1 0 -5.9 8.2" fill="none" stroke="rgb(84 84 73)" strokeWidth={0.8} strokeDasharray="0.6 0.5" />
          <circle r={5.6} fill="rgb(20 21 18)" stroke={TONE_COLOR[coreTone]} strokeWidth={0.5} />
          <circle r={1.7} fill={TONE_COLOR[coreTone]} opacity={m.hasRun ? 0.9 : 0.35} className={m.phase === "running" ? "nc-pulse" : undefined} />

          {ZONE_LIST.map((z) => {
            const a = byId.get(z.id);
            const tone = a?.tone ?? "dim";
            const color = TONE_COLOR[tone];
            const live = tone === "run" || tone === "warn";
            const ry = (-yawOf(z) * 180) / Math.PI;
            const isPlanner = z.id === "planner";
            return (
              <g key={z.id} transform={`rotate(${ry.toFixed(2)} ${z.x} ${z.z})`}>
                <rect x={z.x - z.w / 2} y={z.z - z.d / 2} width={z.w} height={z.d} fill={color} fillOpacity={live ? 0.2 : isPlanner ? 0.22 : 0.09} stroke={color} strokeOpacity={live ? 0.95 : 0.5} strokeWidth={live ? 0.55 : 0.35} className={live ? "nc-pulse" : undefined} />
                <rect x={z.x - z.w / 2} y={z.z + z.d / 2 - 0.9} width={z.w} height={0.9} fill={color} fillOpacity={0.85} />
              </g>
            );
          })}
          {ZONE_LIST.map((z) => (
            <text key={`t${z.id}`} x={z.x} y={z.z + 1} fontSize={z.id === "planner" ? 2.6 : 3.4} textAnchor="middle" fontFamily="var(--nc-font-data)" fill="rgb(232 228 216)" opacity={0.85}>{z.number}</text>
          ))}
        </svg>
        <div className="flex items-center justify-between border-t border-nc-line px-3 py-2.5 font-data text-[10px] uppercase tracking-[0.16em]">
          <span className="text-nc-lo">{m.hasRun ? "Live from the event stream" : "The facility is idle"}</span>
          <span className="flex items-center gap-1.5 text-nc-cyan group-hover:text-nc-hi">Enter lab <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
        </div>
      </button>
    </Section>
  );
}
