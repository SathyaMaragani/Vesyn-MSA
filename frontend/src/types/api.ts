/**
 * Every backend call resolves to one of these - it never throws and never
 * substitutes data. "offline" means the API could not be reached at all
 * (network error or timeout); "error" means it answered with a failure.
 */
export type ApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "offline"; message: string }
  | { status: "error"; code: number; message: string };

/** What a view shows for something it loads. */
export type LoadState<T> =
  | { state: "loading" }
  | { state: "ok"; data: T }
  | { state: "empty" }
  | { state: "error"; message: string }
  | { state: "offline" };

export type ApiHealth = "checking" | "online" | "offline";
export type SocketStatus = "idle" | "connecting" | "live" | "reconnecting";
