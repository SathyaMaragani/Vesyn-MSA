// Pure logic for the site-wide motion system. No DOM, no three.js: everything here
// is unit-tested (tests/motion.test.ts).

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const COVER_MS = 680;
export const REVEAL_MS = 820;
export const HOLD_MS = 140; // the screen stays fully covered this long once the new route is ready
export const NAV_TIMEOUT_MS = 4000; // reveal anyway if the route never reports in

/**
 * Sections that share one persistent world. Moving between /lab, /lab/chemistry...
 * only slides a sheet over the lab, so it never gets the full-screen wipe.
 */
export function sectionOf(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ?? "";
}

export type NavKind = "none" | "soft" | "wipe" | "hard";

/** Sections that live in another root layout: navigating there is a full document load. */
const OTHER_ROOT = new Set(["landing"]);

/**
 * Decide how a click on a link should navigate. "none" = let the browser / Next
 * handle it untouched (new tab, modifier keys, downloads, hash jumps, other origins).
 */
export function classifyNavigation(
  from: string,
  href: string,
  origin: string,
  opts: { button?: number; meta?: boolean; target?: string | null; download?: boolean; optOut?: boolean } = {},
): { kind: NavKind; path: string } {
  const none = { kind: "none" as const, path: from };
  if (opts.optOut || opts.download) return none;
  if ((opts.button ?? 0) !== 0 || opts.meta) return none;
  if (opts.target && opts.target !== "_self") return none;
  let url: URL;
  try {
    url = new URL(href, origin + from);
  } catch {
    return none;
  }
  if (url.origin !== origin) return none;
  if (url.pathname === from) return none; // same page (hash jump, query change)
  const next = url.pathname + url.search;
  if (sectionOf(url.pathname) === sectionOf(from)) return { kind: "soft", path: next };
  if (OTHER_ROOT.has(sectionOf(url.pathname)) || OTHER_ROOT.has(sectionOf(from))) return { kind: "hard", path: next };
  return { kind: "wipe", path: next };
}

/** A short label for the wipe, taken from the destination. Never a claim about data. */
export function destinationLabel(path: string): string {
  const s = sectionOf(path.split("?")[0]);
  if (s === "lab") return "LABORATORY";
  if (s === "landing") return "ABOUT";
  return "AIRLOCK";
}

export type WipePhase = "idle" | "cover" | "hold" | "reveal";

/**
 * The wipe as a function of time. Coverage 0 = clear, 1 = fully covered.
 * `navReadyAt` is when the destination reported in (null until then); the reveal
 * waits for it, but never longer than NAV_TIMEOUT_MS.
 */
export function wipeAt(elapsed: number, navReadyAt: number | null): { phase: WipePhase; cover: number } {
  if (elapsed < COVER_MS) return { phase: "cover", cover: easeInOutCubic(elapsed / COVER_MS) };
  const giveUpAt = COVER_MS + NAV_TIMEOUT_MS;
  const ready = navReadyAt ?? (elapsed >= giveUpAt ? giveUpAt : null);
  if (ready === null) return { phase: "hold", cover: 1 };
  const revealStart = Math.max(COVER_MS, ready) + HOLD_MS;
  if (elapsed < revealStart) return { phase: "hold", cover: 1 };
  const k = (elapsed - revealStart) / REVEAL_MS;
  if (k >= 1) return { phase: "idle", cover: 0 };
  return { phase: "reveal", cover: 1 - easeInOutCubic(k) };
}

/** Wheel delta in pixels regardless of deltaMode (0 pixels, 1 lines, 2 pages). */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return deltaY * 32;
  if (deltaMode === 2) return deltaY * pageHeight;
  return deltaY;
}

/** Exponential smoothing step: frame-rate independent, so 60 Hz and 144 Hz feel the same. */
export function smoothStep(current: number, target: number, dtSeconds: number, rate = 9): number {
  return current + (target - current) * (1 - Math.exp(-dtSeconds * rate));
}
