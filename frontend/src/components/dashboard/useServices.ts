"use client";

// Polls the few health endpoints the backend has and turns them into ServiceStatus rows (see
// lib/dashboard/services.ts for what each one means). Polls only while the API answers; when it does not,
// every dependent service reads OFFLINE rather than being guessed.
import { useEffect, useMemo, useState } from "react";
import { request } from "@/lib/api/http";
import { serviceStatuses, type EvidenceStatus, type RetroHealth, type ServiceProbes, type ServiceStatus } from "@/lib/dashboard/services";
import { useNeo } from "@/lib/store/NeoProvider";

const POLL_MS = 10_000;
const NONE: ServiceProbes = { retro: null, evidence: null, library: null };

export function useServices(): ServiceStatus[] {
  const { health, socket, runId, projects, apiBase } = useNeo();
  const [probes, setProbes] = useState<ServiceProbes>(NONE);

  useEffect(() => {
    if (health !== "online") {
      setProbes(NONE);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const [retro, evidence, library] = await Promise.all([
        request<RetroHealth>("/retrosynthesis/health", { timeoutMs: 5000 }),
        request<EvidenceStatus>("/retrosynthesis/evidence/status", { timeoutMs: 5000 }),
        request<unknown>("/molecules/stats", { timeoutMs: 5000 }),
      ]);
      if (stopped) return;
      setProbes({ retro, evidence, library });
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [health]);

  return useMemo(() => serviceStatuses({ health, socket, runId, projects, apiBase, probes }), [health, socket, runId, projects, apiBase, probes]);
}
