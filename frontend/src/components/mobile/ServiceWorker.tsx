"use client";

// Registers public/sw.js, which is what makes the app installable and keeps the shell readable offline.
// Registration failing is not an error worth showing anyone: the app works without it.
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const removeLegacy = async (all = false) => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter((r) =>
        r.active?.scriptURL === `${location.origin}/sw.js` && (all || r.scope === `${location.origin}/`)
      ).map((r) => r.unregister()));
    };
    if (process.env.NODE_ENV !== "production") {
      void removeLegacy(true).catch(() => undefined);
      return;
    }
    const id = setTimeout(() => {
      void removeLegacy().then(() => navigator.serviceWorker.register("/sw.js", { scope: "/assistant" })).catch(() => {
        /* unsupported, blocked, or served over plain http from another host */
      });
    }, 1200); // after first paint: the shell matters more than the cache
    return () => clearTimeout(id);
  }, []);
  return null;
}
