import { API_BASE } from "@/lib/api/config";

/** The Documents screens reach the evidence service through the Vesyn API, so one address is public. */
export const BASE = `${API_BASE}/api/evidence/app`;

export type Project = {
  id: string;
  name: string;
  services: string[];
  scope: { areas: string[]; questions: string[] };
};

export type Source = {
  id: string;
  filename: string;
  title: string;
  type: string;
  service: string | null;
  date: string | null;
  owner: string | null;
  version: number;
  latest: boolean;
  status: "uploaded" | "processing" | "ready" | "failed";
  error: string | null;
  chunk_count: number;
  checksum: string;
};

/** A stored chunk with its location in the source. */
export type Passage = {
  id: string;
  title: string;
  source_type: string;
  text: string;
  page: number | null;
  section: string | null;
  date: string | null;
  version: number;
  retrievers: string[];
};

/** Citations from the finding-detail endpoint also carry the resolved passage fields. */
export type Citation = { chunk_id: string; source_id: string; quote: string; resolved?: boolean; latest?: boolean } & Partial<
  Omit<Passage, "id" | "retrievers">
>;

export type Finding = {
  id: string;
  investigation_id: string;
  key: string;
  category: string;
  question: string;
  claim: string;
  service: string;
  severity: "high" | "medium" | "low";
  severity_rationale: string;
  evidence_status: string;
  supporting: Citation[];
  contradicting: Citation[];
  limitation: string;
  next_step: string;
  change_reason: string;
  changes?: { field: string; from: string; to: string }[];
  history?: { id: string; created_at: string; evidence_status: string; severity: string; change_reason: string }[];
};

export type Investigation = {
  id: string;
  created_at: string;
  status: "running" | "complete" | "failed";
  error: string | null;
  previous_id: string | null;
  model: string;
  prompt_version: string;
  source_snapshot: unknown[];
};

/** One question answered from the documents. Nothing is stored. */
export type Answer = {
  findings: Pick<
    Finding,
    "claim" | "service" | "severity" | "evidence_status" | "supporting" | "contradicting" | "limitation" | "next_step"
  >[];
  retrieved_chunk_ids: string[];
  citations_emitted: number;
  citations_rejected: number;
  model_version: string;
};

export type Diff = { against: string } & Record<"added" | "updated" | "resolved" | "unchanged" | "removed", Finding[]>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : `${res.status} ${res.statusText}`);
  }
  return (res.headers.get("content-type") ?? "").includes("json") ? res.json() : (res.text() as Promise<T>);
}

export const get = <T>(path: string) => request<T>(path);

const KEY = "vesyn-evidence-key";

/** The access key is kept for this browser tab only. Uploads, reviews and questions send it. */
export const accessKey = (): string => {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

export const setAccessKey = (value: string): void => {
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the key is simply not remembered
  }
};

export const post = <T>(path: string, body?: unknown) => {
  const key = accessKey();
  const auth: Record<string, string> = key ? { "X-Vesyn-Key": key } : {};
  return request<T>(path, {
    method: "POST",
    ...(body instanceof FormData
      ? { body, headers: auth }
      : { headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify(body ?? {}) }),
  });
};

export const day = (iso?: string | null) => iso?.slice(0, 10) ?? "undated";
export const minute = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
export const where = (p: { page?: number | null; section?: string | null }) =>
  p.page ? `page ${p.page}` : p.section ? `section “${p.section}”` : "whole document";
