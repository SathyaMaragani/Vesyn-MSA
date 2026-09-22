import type { ApiResult } from "@/types/api";
import { request } from "./http";

// Long on purpose: a new connection through Tailscale Funnel usually takes 1.5-5 s but was
// measured at up to ~16 s, and a check cut off mid-handshake would call a working API offline.
// Until it answers the UI says CHECKING, which is true.
export const getHealth = (): Promise<ApiResult<{ status: string }>> => request("/health", { timeoutMs: 20000 });
