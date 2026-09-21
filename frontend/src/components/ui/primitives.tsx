import React from "react";
import type { Tone } from "@/lib/events/activity";
import type { LoadState } from "@/types/api";

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(" ");

export const TONE_TEXT: Record<Tone, string> = {
  dim: "text-nc-lo",
  idle: "text-nc-mid",
  run: "text-nc-cyan",
  warn: "text-nc-warn",
  ok: "text-nc-ok",
  bad: "text-nc-bad",
};

export const TONE_BORDER: Record<Tone, string> = {
  dim: "border-nc-line-strong",
  idle: "border-nc-line-strong",
  run: "border-nc-cyan/50",
  warn: "border-nc-warn/50",
  ok: "border-nc-ok/50",
  bad: "border-nc-bad/50",
};

export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("nc-panel flex min-h-0 flex-col", className)}>
      {title && (
        <header className="flex h-8 shrink-0 items-center justify-between border-b border-nc-line px-3">
          <h2 className="nc-label">{title}</h2>
          {aside}
        </header>
      )}
      <div className={cx("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Tag({ tone = "idle", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center border px-1.5 py-px font-data text-[10px] uppercase tracking-wider",
        TONE_TEXT[tone],
        TONE_BORDER[tone],
      )}
    >
      {children}
    </span>
  );
}

/** The one way to render an absent value. Never a dash, never a default. */
export function NotReported({ note }: { note?: string }) {
  return (
    <span className="font-data text-[11px] italic text-nc-lo" title={note}>
      not reported
    </span>
  );
}

export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode | null | undefined;
  mono?: boolean;
}) {
  const absent = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <div className="nc-label">{label}</div>
      <div className={cx("mt-0.5 break-words text-[13px] text-nc-hi", mono && "font-data text-[12px]")}>
        {absent ? <NotReported /> : value}
      </div>
    </div>
  );
}

/** Loading / empty / error / offline for a view that is waiting on the backend. */
export function StateNotice({
  kind,
  title,
  detail,
}: {
  kind: "loading" | "empty" | "error" | "offline";
  title?: string;
  detail?: React.ReactNode;
}) {
  const defaults: Record<typeof kind, { title: string; tone: Tone; mark: string }> = {
    loading: { title: "Loading", tone: "run", mark: "◌" },
    empty: { title: "Nothing here yet", tone: "idle", mark: "○" },
    error: { title: "Backend returned an error", tone: "bad", mark: "!" },
    offline: { title: "API OFFLINE", tone: "bad", mark: "×" },
  };
  const d = defaults[kind];
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className={cx("font-data text-2xl", TONE_TEXT[d.tone], kind === "loading" && "nc-pulse")}>{d.mark}</div>
      <div className={cx("font-data text-xs uppercase tracking-[0.18em]", TONE_TEXT[d.tone])}>{title ?? d.title}</div>
      {detail && <div className="max-w-md text-[12px] text-nc-mid">{detail}</div>}
    </div>
  );
}

/** Renders a LoadState: the caller supplies only what to show on success. */
export function Loaded<T>({
  load,
  empty,
  children,
}: {
  load: LoadState<T>;
  empty: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  switch (load.state) {
    case "loading":
      return <StateNotice kind="loading" />;
    case "offline":
      return <StateNotice kind="offline" detail="The backend could not be reached. Nothing is shown until it responds." />;
    case "error":
      return <StateNotice kind="error" detail={load.message} />;
    case "empty":
      return <>{empty}</>;
    case "ok":
      return <>{children(load.data)}</>;
  }
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx("font-data text-[12px] text-nc-hi", className)}>{children}</span>;
}

export function JsonBlock({ value, limit = 6000 }: { value: unknown; limit?: number }) {
  const [full, setFull] = React.useState(false);
  const text = React.useMemo(() => {
    try {
      return JSON.stringify(value, null, 2) ?? "null";
    } catch {
      return String(value);
    }
  }, [value]);
  const clipped = !full && text.length > limit;
  return (
    <div>
      <pre className="max-h-96 overflow-auto border border-nc-line bg-nc-base p-2 font-data text-[11px] leading-snug text-nc-mid">
        {clipped ? `${text.slice(0, limit)}\n…` : text}
      </pre>
      {text.length > limit && (
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className="nc-focus mt-1 font-data text-[10px] uppercase tracking-wider text-nc-cyan hover:underline"
        >
          {full ? "collapse" : `show all (${text.length.toLocaleString()} chars)`}
        </button>
      )}
    </div>
  );
}
