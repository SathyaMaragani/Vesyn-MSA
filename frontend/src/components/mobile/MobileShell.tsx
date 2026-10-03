"use client";

// The phone shell: a thin status strip, the screen, and the bottom nav with Research raised in the
// middle. Nothing here fetches - it reads the same provider the laptop app uses.
//
// It also watches the open run for the whole app, so a run started and left behind still announces
// itself when it lands: a line on screen, and a local notification if the user allowed one.
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, CircleUser, Clock, FlaskConical, Home, Sparkles, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { notifyFinished } from "@/lib/mobile/assistant";
import { useNeo } from "@/lib/store/NeoProvider";
import { rememberInstallPrompt, type InstallPrompt } from "@/lib/mobile/install";

const NAV: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/assistant", label: "Home", Icon: Home },
  { href: "/assistant/memory", label: "Memory", Icon: Brain },
  { href: "/assistant/research", label: "Research", Icon: Sparkles },
  { href: "/assistant/history", label: "History", Icon: Clock },
  { href: "/assistant/profile", label: "Profile", Icon: CircleUser },
];

/** Announces a run reaching a terminal state, wherever the user is in the app. */
function useRunFinished(): { text: string; tone: "ok" | "bad" } | null {
  const { liveRun, projects, projectId, demo } = useNeo();
  const [note, setNote] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const was = useRef(liveRun.phase);

  useEffect(() => {
    const before = was.current;
    was.current = liveRun.phase;
    if (demo) return; // a recording is already finished; it did not just land
    const ended = liveRun.phase === "completed" || liveRun.phase === "failed";
    // only a run that was watched running has just landed; opening a finished one is not news
    if (!ended || before !== "running") return;
    const name = projects.state === "ok" ? (projects.data.find((p) => p.id === projectId)?.name ?? "Your research") : "Your research";
    const ok = liveRun.phase === "completed";
    const text = ok ? `${name} — complete.` : `${name} — the run failed.`;
    setNote({ text, tone: ok ? "ok" : "bad" });
    notifyFinished(ok ? "VESYN research complete" : "VESYN research failed", text);
  }, [liveRun.phase, projects, projectId, demo]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(id);
  }, [note]);

  return note;
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { health, demo, demoStage, cached } = useNeo();
  const finished = useRunFinished();
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); rememberInstallPrompt(event as InstallPrompt); };
    const installed = () => rememberInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  // Offline only once a check has failed; while it is pending the API is not known to be down.
  const offline = health === "offline";

  return (
    <div className="nc-mobile m-root flex flex-col bg-nc-base">
      <div className="m-top sticky top-0 z-30 border-b border-nc-line bg-nc-raised/95 backdrop-blur">
        <div className="mx-auto flex h-[var(--m-bar)] max-w-[680px] items-center gap-2 px-5">
          <Link href="/assistant" className="nc-focus flex min-w-0 items-center gap-2 rounded-lg">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-nc-cyan/[0.08] text-nc-cyan"><FlaskConical className="h-5 w-5" strokeWidth={1.7} /></span>
            <span className="font-ui text-[15px] font-semibold tracking-[0.16em] text-nc-hi">VESYN</span>
          </Link>
          <span className="ml-auto flex items-center gap-2">
            {demo && (
              <span className="rounded-md border border-nc-warn/60 px-2 py-[2px] font-data text-[9.5px] uppercase tracking-[0.14em] text-nc-warn">
                Demo data
              </span>
            )}
            <span
              className="flex items-center gap-1.5 rounded-full bg-nc-base px-2.5 py-1.5 font-ui text-[11px] font-medium"
              style={{ color: offline ? "rgb(var(--nc-bad))" : health === "online" ? "rgb(var(--nc-ok))" : "rgb(var(--nc-lo))" }}
              role="status"
            >
              <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full bg-current", health === "checking" && "nc-pulse")} />
              {offline ? "Offline" : health === "online" ? "Connected" : "Checking"}
            </span>
          </span>
        </div>

        {offline && !demo && (
          <p role="status" className="flex items-center gap-2 border-t border-nc-bad/30 bg-nc-bad/[0.07] px-4 py-1.5 text-[11.5px] text-nc-mid">
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-nc-bad" aria-hidden />
            You are offline. History and memories are cached; a question you write will wait.
          </p>
        )}
        {demo && (
          <p role="status" className="border-t border-nc-warn/30 bg-nc-warn/[0.06] px-4 py-1.5 text-[11.5px] text-nc-mid">
            {demoStage ? "Guided demo · recorded data with simulated research outcomes." : "Recorded demo · the research service is not reachable from this device."}
          </p>
        )}
      </div>
      {cached && <p role="status" className="px-4 py-2 text-[12px] text-nc-warn">Saved investigation · offline copy, not a current live result.</p>}

      {finished && (
        <p
          role="status"
          className="mx-4 mt-3 rounded-xl border px-3.5 py-2.5 text-[12.5px] text-nc-hi"
          style={{ borderColor: finished.tone === "ok" ? "rgb(var(--nc-ok) / 0.6)" : "rgb(var(--nc-bad) / 0.6)" }}
        >
          {finished.text}
        </p>
      )}

      <main className="mx-auto min-h-0 w-full max-w-[680px] flex-1 px-5 pb-8 pt-5">{children}</main>

      <nav
        aria-label="Main"
        className="m-nav-bar fixed inset-x-0 bottom-0 z-30 border-t border-nc-line bg-nc-raised/95 backdrop-blur"
      >
        <ul className="mx-auto flex h-[var(--m-nav)] max-w-[520px] items-stretch">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/assistant" ? path === href : path.startsWith(href);
            const centre = label === "Research";
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "nc-focus flex h-full flex-col items-center justify-center gap-1",
                    centre && "relative",
                    active ? "text-nc-cyan" : "text-nc-lo",
                  )}
                >
                  {centre ? (
                    <span
                      className={cx(
                        "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
                        active ? "border-nc-cyan bg-nc-cyan text-nc-base" : "border-nc-cyan/60 text-nc-cyan",
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                  ) : (
                    <Icon className="h-[19px] w-[19px]" aria-hidden />
                  )}
                  <span className={cx("text-[10px] tracking-wide", centre && "sr-only")}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
