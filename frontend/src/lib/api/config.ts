/**
 * Backend location. One place, one env var (NEXT_PUBLIC_API_URL). The default is
 * the NeoChems API port from the README (8436), not RamChems' 8434.
 */
export const API_BASE: string = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8436").replace(
  /\/+$/,
  "",
);

export const WS_BASE: string = API_BASE.replace(/^http/, "ws");
