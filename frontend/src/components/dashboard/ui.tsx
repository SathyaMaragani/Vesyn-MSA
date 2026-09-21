"use client";

// The dashboard's small vocabulary: editorial sections (a hairline and a label, not a box), status marks,
// count-up numerals. Colour carries meaning only: sage = in progress, lichen = done, amber = scrutiny,
// copper = failed. Nothing here knows about the backend.
import React, { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/primitives";
import type { Tone } from "@/lib/events/activity";

export const TONE_COLOR: Record<Tone, string> = {
  run: "rgb(var(--nc-cyan))",
  ok: "rgb(var(--nc-ok))",
  warn: "rgb(var(--nc-warn))",
  bad: "rgb(var(--nc-bad))",
  idle: "rgb(var(--nc-mid))",
  dim: "rgb(var(--nc-lo))",
};

export const NOT_REPORTED = "NOT REPORTED";

/** An editorial section: a hairline, a small-caps label, an optional aside on the right. No box. */
export function Section({
  label,
  index,
  aside,
  children,
  className,
}: {
  label: string;
  index?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("min-w-0", className)}>
      <div className="mb-3 flex items-baseline gap-3 border-t border-nc-line-strong pt-2.5">
        {index && <span className="font-data text-[10px] tracking-[0.18em] text-nc-lo">{index}</span>}
        <h2 className="font-data text-[11px] font-medium uppercase tracking-[0.2em] text-nc-hi">{label}</h2>
        {aside && <div className="ml-auto flex items-baseline gap-3 font-data text-[10px] text-nc-lo">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Dot({ tone, pulse = false, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return <span aria-hidden className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", pulse && "nc-pulse", className)} style={{ background: TONE_COLOR[tone] }} />;
}

/** HH:MM:SS in local time, or "not reported". */
export function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "not reported";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Eases a number toward its target, so counts arrive instead of snapping. null stays null. */
export function useTween(target: number | null, ms = 650): number | null {
  const [v, setV] = useState<number | null>(target);
  const from = useRef<number | null>(target);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (target === null || from.current === null || reducedMotion()) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const b = target;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = a + (b - a) * e;
      from.current = cur;
      setV(cur);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

/** A large numeral with a small caption. A null value reads NOT REPORTED, never 0. */
export function Numeral({ value, label, tone = "idle", size = "lg" }: { value: number | null; label: string; tone?: Tone; size?: "lg" | "xl" }) {
  const shown = useTween(value);
  return (
    <div className="min-w-0">
      <div className={cx("font-data font-light leading-none tabular-nums", size === "xl" ? "text-[56px]" : "text-[38px]")} style={{ color: value === null ? "rgb(var(--nc-lo))" : value === 0 ? "rgb(var(--nc-mid))" : TONE_COLOR[tone === "idle" ? "ok" : tone] }}>
        {shown === null ? <span className="text-[13px] tracking-[0.14em]">{NOT_REPORTED}</span> : Math.round(shown)}
      </div>
      <div className="mt-1.5 font-data text-[10px] uppercase tracking-[0.16em] text-nc-lo">{label}</div>
    </div>
  );
}

export const PIPE = "font-data text-[10px] uppercase tracking-[0.16em]";
