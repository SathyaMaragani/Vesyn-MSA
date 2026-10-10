"use client";

// The RAG page's small vocabulary, built from the dashboard's own: the same panels, pills and buttons as Search.
import type { ReactNode } from "react";
import { Card as Panel, StatusPill } from "@/components/dashboard/ui";
import { cx } from "@/components/ui/primitives";
import type { Tone } from "@/lib/events/activity";

// Colour carries meaning only, as on the rest of the dashboard: lichen = settled, amber = scrutiny, copper = a problem.
const TONES: Record<string, Tone> = {
  high: "bad",
  medium: "warn",
  low: "dim",
  supported: "bad",
  conflicting: "warn",
  fix_unverified: "warn",
  resolved: "ok",
  not_established: "dim",
  ready: "ok",
  failed: "bad",
  processing: "run",
  uploaded: "run",
};

export const label = (value: string) => value.replace(/_/g, " ");

export function Badge({ value, prefix }: { value: string; prefix?: string }) {
  return (
    <StatusPill tone={TONES[value] ?? "idle"}>
      {prefix}
      {label(value)}
    </StatusPill>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="rounded-lg border border-nc-bad/40 bg-nc-bad/[0.06] px-3 py-2 font-data text-[12px] text-nc-bad">
      {message}
    </p>
  ) : null;
}

export function Card({
  title,
  aside,
  children,
  className,
  lit,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  lit?: boolean;
}) {
  if (!title) return <section className={cx("nc-card p-4", lit && "nc-card-lit", className)}>{children}</section>;
  return (
    <Panel title={title} aside={aside} className={className} lit={lit}>
      {children}
    </Panel>
  );
}

export const button =
  "nc-focus inline-flex h-9 items-center gap-2 rounded-lg bg-nc-cyan px-4 font-data text-[11.5px] font-semibold uppercase tracking-wider text-nc-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-nc-line disabled:text-nc-lo";
export const buttonQuiet = "nc-btn px-3 py-1.5 text-[11.5px] disabled:cursor-not-allowed disabled:opacity-50";
// font-ui / normal-case / tracking-normal: a control inside a small-caps caption must not inherit the caption's type.
export const input =
  "nc-focus h-9 rounded-lg border border-nc-line-strong bg-nc-raised px-2.5 font-ui text-[12.5px] font-normal normal-case tracking-normal text-nc-hi placeholder:text-nc-lo";
/** A small-caps caption above its control. */
export const field = "nc-label flex flex-col gap-1";
