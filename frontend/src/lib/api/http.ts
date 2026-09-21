import type { ApiResult } from "@/types/api";
import { API_BASE } from "./config";

const DEFAULT_TIMEOUT_MS = 8000;

/** FastAPI puts a string or a list of validation errors in `detail`. */
function describeFailure(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d),
        )
        .join("; ");
    }
  }
  return fallback;
}

/**
 * Every call resolves; nothing throws. A network failure or timeout is
 * "offline" (the UI shows API OFFLINE), a non-2xx answer is "error".
 */
export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: "no-store",
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      return {
        status: "error",
        code: response.status,
        message: describeFailure(payload, `${response.status} ${response.statusText}`.trim()),
      };
    }
    return { status: "ok", data: payload as T };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "request timed out" : String(err);
    return { status: "offline", message };
  } finally {
    clearTimeout(timer);
  }
}
