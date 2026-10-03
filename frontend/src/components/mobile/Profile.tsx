"use client";

// PROFILE: what this device is connected to, what it remembers, and the few switches that do something.
//
// Every row here states a fact the app can check - the backend it talks to and whether it answers, which
// services are up, what the platform grants this browser. A setting that would need a server this
// project does not run says so rather than offering a dead toggle.
import React, { useEffect, useMemo, useState } from "react";
import { Bell, Camera, Download, Mic, Server, Trash2 } from "lucide-react";
import { isProblem, type ServiceState } from "@/lib/dashboard/services";
import { loadSeen } from "@/lib/mobile/assistant";
import { useSpeech } from "@/lib/mobile/speech";
import { installPrompt, rememberInstallPrompt, type InstallPrompt } from "@/lib/mobile/install";
import { useNeo } from "@/lib/store/NeoProvider";
import { useServices } from "@/components/dashboard/useServices";
import { Empty, Row, ScreenHeader, StatusPill, Tile, TONE_COLOR } from "./ui";

/** services.ts already names each state; this only picks its colour. */
const SERVICE_TONE: Record<ServiceState, "ok" | "warn" | "bad" | "dim"> = {
  online: "ok",
  warn: "warn",
  offline: "bad",
  error: "bad",
  idle: "dim",
  checking: "dim",
};

/** Chrome fires this when the app is installable; there is no API to ask after the fact. */

function Setting({
  Icon,
  title,
  detail,
  action,
}: {
  Icon: typeof Bell;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="m-card flex items-start gap-3 px-3.5 py-3">
      <Icon className="mt-[2px] h-4 w-4 shrink-0 text-nc-cyan" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-nc-hi">{title}</div>
        <p className="mt-0.5 text-[11.5px] leading-snug text-nc-lo">{detail}</p>
      </div>
      {action}
    </li>
  );
}

export function Profile() {
  const neo = useNeo();
  const services = useServices();
  const speech = useSpeech(() => {});
  const [seen, setSeen] = useState(0);
  const [applied, setApplied] = useState(0);
  const [permission, setPermission] = useState<string>("default");
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [cleared, setCleared] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    setInstall(installPrompt());
    const items = loadSeen();
    setSeen(items.length);
    setApplied(items.filter((m) => m.rankedDown.length > 0).length);
    try {
      setPermission(typeof Notification !== "undefined" ? Notification.permission : "unavailable");
    } catch {
      /* notifications unavailable on this device */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const checkWorker = () => setOfflineReady(!!navigator.serviceWorker?.controller);
    checkWorker();
    navigator.serviceWorker?.addEventListener("controllerchange", checkWorker);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      navigator.serviceWorker?.removeEventListener("controllerchange", checkWorker);
    };
  }, []);

  const investigations = neo.projects.state === "ok" ? neo.projects.data.length : null;
  const problems = useMemo(() => services.filter(isProblem), [services]);

  const clear = () => {
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith("vesyn.")) window.localStorage.removeItem(key);
    } catch {
      /* nothing stored to clear */
    }
    setSeen(0);
    setApplied(0);
    setCleared(true);
  };

  return (
    <div className="space-y-6">
      <ScreenHeader title="This device" sub="VESYN runs on your own backend; the app holds no account and signs nothing in." />

      <section aria-labelledby="m-stats">
        <h2 id="m-stats" className="m-label mb-2.5">
          Research memory
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Tile value={seen} label="Experiences remembered" />
          <Tile value={applied} label="Changed a ranking" tone={applied ? "bad" : "ok"} />
          <Tile value={investigations} label="Investigations" />
        </div>
      </section>

      <section aria-labelledby="m-backend">
        <h2 id="m-backend" className="m-label mb-2.5">
          Backend
        </h2>
        <ul className="space-y-2">
          <li>
            <Row
              title={<span className="font-data text-[12px]">{neo.apiBase}</span>}
              detail={neo.demo ? "Not reachable — showing a recorded investigation" : "The research service this app asks"}
              aside={
                <StatusPill tone={neo.health === "online" ? "ok" : neo.health === "offline" ? "bad" : "dim"} live={neo.health === "checking"}>
                  {neo.health === "online" ? "Online" : neo.health === "offline" ? "Offline" : "Checking"}
                </StatusPill>
              }
            />
          </li>
          {services.map((s) => (
            <li key={s.id}>
              <Row
                title={s.label}
                detail={s.detail ?? undefined}
                aside={<StatusPill tone={SERVICE_TONE[s.state]}>{s.word.charAt(0) + s.word.slice(1).toLowerCase()}</StatusPill>}
              />
            </li>
          ))}
        </ul>
        {problems.length === 0 && neo.health === "online" && (
          <p className="mt-2 text-[11px] text-nc-lo" style={{ color: TONE_COLOR.ok }}>
            Every service this app needs is answering.
          </p>
        )}
      </section>

      <section aria-labelledby="m-settings">
        <h2 id="m-settings" className="m-label mb-2.5">
          Settings
        </h2>
        <ul className="space-y-2">
          <Setting
            Icon={Bell}
            title="Tell me when research finishes"
            detail={
              permission === "granted"
                ? "On while this app is open. A completed run raises a local notification, including when you use another screen."
                : permission === "denied"
                  ? "Declined in the browser. Re-allow notifications for this site to switch it on."
                  : permission === "unavailable" ? "Notifications are unavailable in this browser. Completion still appears in the app."
                  : "Get a local notification while the app is open. Delivery after closing it requires a future push service."
            }
            action={
              permission === "default" ? (
                <button
                  type="button"
                  onClick={() => void Notification.requestPermission().then(setPermission)}
                  className="m-chip shrink-0 text-[11.5px]"
                >
                  Allow
                </button>
              ) : undefined
            }
          />
          <Setting
            Icon={Mic}
            title="Voice input"
            detail={speech.supported ? "Available on this device — the mic appears in the ask bar." : "This browser has no speech recognition; typing is the fallback."}
          />
          <Setting
            Icon={Camera}
            title="Camera"
            detail="Capture and preview work. VESYN has no vision endpoint yet, so a photo is not sent anywhere — describe what to look at."
          />
          <Setting
            Icon={Server}
            title="Offline"
            detail={offlineReady ? "Ready for offline use. Previously opened investigations, memories and drafts are saved on this device." : "Your drafts are saved. Offline page access becomes available once the app finishes preparing on a secure connection."}
          />
          {install && (
            <Setting
              Icon={Download}
              title="Install VESYN"
              detail="Add it to the home screen and it opens without browser chrome."
              action={
                <button type="button" onClick={() => void install.prompt().then(() => { setInstall(null); rememberInstallPrompt(null); }).catch(() => setInstall(null))} className="m-chip shrink-0 text-[11.5px]">
                  Install
                </button>
              }
            />
          )}
          {!install && <Setting Icon={Download} title="Install VESYN" detail="On Android, open this app over HTTPS in Chrome and choose Install app or Add to Home screen from the browser menu. If already installed, launch VESYN from your home screen." />}
          <Setting
            Icon={Trash2}
            title="Clear this device"
            detail={cleared ? "Cleared. Investigations themselves stay on the server." : "Removes the chat threads, remembered experiences and drafts held on this phone. The research itself stays on the server."}
            action={
              <button type="button" onClick={clear} className="m-chip shrink-0 text-[11.5px]">
                Clear
              </button>
            }
          />
        </ul>
      </section>

      {neo.rejectedFrames > 0 && (
        <Empty title={`${neo.rejectedFrames} frames from the event stream were not valid VESYN events.`} detail="They were discarded rather than guessed at." />
      )}
    </div>
  );
}
