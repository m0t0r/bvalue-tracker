/**
 * RESEARCH PROTOTYPE (instant /insights), the `tq` flag: the same idea as `local-first.ts`, built
 * from TanStack Query's own per-query persister over IndexedDB (idb-keyval) instead of by hand.
 *
 * Each query is one IndexedDB entry under its query hash, so the monitor's `["events", zone]` is the
 * entry `/insights` restores. `restoreQueries` fills the cache before the first render; `persisterFn`
 * on the client saves every answer, and restores lazily a query nobody restored.
 */
import { experimental_createQueryPersister, type PersistedQuery } from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";
import { del, entries, get, set } from "idb-keyval";
import { getContext, getEvents } from "./api";
import { MAX_AGE_MS, proto } from "./local-first";
import { ZONE_IDS } from "../../core/zones";

const persister = experimental_createQueryPersister<PersistedQuery>({
  storage: {
    getItem: (key) => get<PersistedQuery>(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
    entries: () => entries<string, PersistedQuery>(),
  },
  // IndexedDB stores objects (structured clone): no JSON round trip.
  serialize: (query) => query,
  deserialize: (stored) => stored,
  maxAge: MAX_AGE_MS,
  buster: "v1",
  refetchOnRestore: "always",
  filters: { predicate: (query) => query.queryKey[0] === "events" || query.queryKey[0] === "context" },
});

export const tqOn = (): boolean => proto("tq") && typeof indexedDB !== "undefined";

/** The client's default `persister`, or none with the flag off. */
export const tqPersister = () => (tqOn() ? { persister: persister.persisterFn } : {});

/** Every stored answer into the cache, before the first render. True when something was restored. */
export async function tqRestore(client: QueryClient): Promise<boolean> {
  if (!tqOn()) return false;
  const t0 = performance.now();
  await persister.restoreQueries(client).catch(() => {});
  performance.measure("proto:seed", { start: t0, end: performance.now() });
  return ZONE_IDS.every((zone) => client.getQueryData(["events", zone]) !== undefined);
}

/**
 * From the monitor, idle: what `/insights` needs, asked for through the client, so an answer already
 * stored is restored (and refreshed behind it) and a missing one is fetched and stored.
 */
export function tqWarm(client: QueryClient): void {
  if (!tqOn()) return;
  for (const zone of ZONE_IDS) {
    void client.prefetchQuery({ queryKey: ["events", zone], queryFn: () => getEvents(zone) });
  }
  void client.prefetchQuery({ queryKey: ["context", "choco"], queryFn: () => getContext("choco") });
}
