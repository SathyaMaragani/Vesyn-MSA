import type { ReactNode } from "react";

const TONES: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-200 text-slate-700",
  supported: "bg-orange-100 text-orange-800",
  conflicting: "bg-purple-100 text-purple-800",
  fix_unverified: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  not_established: "bg-slate-200 text-slate-700",
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  processing: "bg-amber-100 text-amber-800",
  uploaded: "bg-amber-100 text-amber-800",
};

export const label = (value: string) => value.replace(/_/g, " ");

export function Badge({ value, prefix }: { value: string; prefix?: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TONES[value] ?? "bg-slate-100 text-slate-700"}`}>
      {prefix}
      {label(value)}
    </span>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  ) : null;
}

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
      {children}
    </section>
  );
}

export const button =
  "rounded bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40";
export const buttonQuiet =
  "rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
export const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
