"use client";

// QUICK ACCESS: only the actions that are useful. Typographic, not a row of buttons.
import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardModel } from "@/lib/dashboard/model";
import { useEnterLab } from "./DashboardFrame";
import { Section } from "./ui";

function Row({ children, onClick, href, hint, disabled }: { children: React.ReactNode; onClick?: (e: React.MouseEvent) => void; href?: string; hint?: string; disabled?: boolean }) {
  const cls = "nc-focus group flex w-full items-baseline justify-between gap-3 border-b border-nc-line/70 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40";
  const inner = (
    <>
      <span className="text-[19px] font-light tracking-tight text-nc-hi transition-colors group-hover:text-nc-cyan">{children}</span>
      <span className="flex items-center gap-2 font-data text-[9px] uppercase tracking-[0.14em] text-nc-lo">
        {hint}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>
  );
}

export function Quick({ m }: { m: DashboardModel }) {
  const enter = useEnterLab();
  return (
    <Section label="Quick access" index="11">
      <div>
        <Row onClick={() => window.dispatchEvent(new Event("nc:focus-run"))} hint="new run">Start new run</Row>
        <Row onClick={(e) => enter({ x: e.clientX, y: e.clientY })} hint="/lab">Open lab</Row>
        <Row href="/lab/routes" hint={m.route ? `route ${m.route.routeId}` : m.candidates ? `${m.candidates} candidates` : "no route yet"}>View current route</Row>
        <Row href="/lab/evidence" hint="provenance">View evidence</Row>
        <Row href="/lab/audit" hint={m.hasRun ? "every event" : "no run"}>Open flight recorder</Row>
      </div>
    </Section>
  );
}
