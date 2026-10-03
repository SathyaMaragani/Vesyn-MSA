"use client";

// The phone's own small vocabulary. Everything that already exists for the laptop app - status pills,
// check rows, the SIMULATED mark, the tone colours - is imported, not rewritten, so one theme change
// moves both. Only the shapes a touch screen needs are new: a bottom sheet, a stat tile, a tappable row.
import React, { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { TONE_COLOR } from "@/components/dashboard/ui";
import type { Tone } from "@/lib/events/activity";

export { CheckRow, SimBadge, StatusPill, TONE_COLOR, NOT_REPORTED } from "@/components/dashboard/ui";

/**
 * A bottom sheet, built on <dialog>. showModal() is what gives it Escape-to-close, focus trapping and
 * the top layer; none of that is worth reimplementing.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // the dialog element fills the viewport; a click outside the panel is a click on the backdrop
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
      className="m-sheet mb-0 ml-0 mr-0 mt-auto max-h-[88svh] w-full max-w-none rounded-t-2xl border border-nc-line bg-nc-raised p-0 text-nc-hi backdrop:bg-black/70 open:flex open:flex-col"
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-nc-line px-4 py-3">
        <span aria-hidden className="h-1 w-9 shrink-0 rounded-full bg-nc-line-strong" />
        <h2 className="nc-title min-w-0 flex-1 truncate">{title}</h2>
        <button type="button" onClick={onClose} className="m-tap -mr-2 rounded-lg text-[13px] text-nc-mid active:text-nc-hi">
          Close
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
    </dialog>
  );
}

/** A figure and its caption. A null value reads as a dash, never as zero. */
export function Tile({ value, label, tone = "ok" }: { value: number | string | null; label: string; tone?: Tone }) {
  return (
    <div className="m-card px-3 py-2.5">
      <div
        className="font-data text-[22px] leading-none tabular-nums"
        style={{ color: value === null ? TONE_COLOR.dim : value === 0 ? TONE_COLOR.idle : TONE_COLOR[tone] }}
      >
        {value ?? "—"}
      </div>
      <div className="mt-1.5 text-[10.5px] leading-tight text-nc-lo">{label}</div>
    </div>
  );
}

/** A full-width tappable row: the list idiom of the whole app. */
export function Row({
  onClick,
  title,
  detail,
  aside,
  className,
}: {
  onClick?: () => void;
  title: React.ReactNode;
  detail?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-nc-hi">{title}</span>
        {detail && <span className="mt-0.5 block truncate text-[11.5px] text-nc-lo">{detail}</span>}
      </span>
      {aside}
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-nc-lo" aria-hidden />}
    </>
  );
  const shape = cx("m-card flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(shape, "nc-focus active:border-nc-cyan/60")}>
      {body}
    </button>
  ) : (
    <div className={shape}>{body}</div>
  );
}

/** The screen header: a title, an optional line under it, an optional control on the right. */
export function ScreenHeader({ title, sub, aside }: { title: string; sub?: string; aside?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-nc-hi">{title}</h1>
        {sub && <p className="mt-1 text-[12.5px] leading-snug text-nc-mid">{sub}</p>}
      </div>
      {aside}
    </header>
  );
}

/** Nothing to show, said plainly, with what to do about it. */
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="m-card px-4 py-8 text-center">
      <p className="text-[13px] text-nc-mid">{title}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-[34ch] text-[11.5px] leading-snug text-nc-lo">{detail}</p>}
    </div>
  );
}
