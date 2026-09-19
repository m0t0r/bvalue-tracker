import type { StatusResponse, StoredEvent } from "../../worker/api-types";

export type { IngestRun, StatusResponse, StoredEvent } from "../../worker/api-types";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getEvents = () => json<StoredEvent[]>("/api/events");
export const getStatus = () => json<StatusResponse>("/api/status");
export const postRefresh = () => json<StatusResponse>("/api/refresh", { method: "POST" });
