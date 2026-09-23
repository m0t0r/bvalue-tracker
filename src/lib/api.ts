import type { ZoneId } from "../../core/zones";
import type { StatusResponse, StoredEvent } from "../../worker/api-types";

export type { IngestRun, StatusResponse, StoredEvent } from "../../worker/api-types";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getEvents = (zone: ZoneId) => json<StoredEvent[]>(`/api/events?zone=${zone}`);
export const getStatus = (zone: ZoneId) => json<StatusResponse>(`/api/status?zone=${zone}`);
export const postRefresh = (zone: ZoneId) => json<StatusResponse>(`/api/refresh?zone=${zone}`, { method: "POST" });
