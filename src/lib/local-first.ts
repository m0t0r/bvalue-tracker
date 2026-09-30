/**
 * RESEARCH PROTOTYPE (instant /insights): the API's last answers kept in the browser, so a page can
 * draw from them at once and ask the network afterwards (stale-while-revalidate, by hand).
 *
 * The store is Cache Storage, from the window: no service worker is needed to use it. Both pages
 * write to it through `json()` in `api.ts`, so the monitor's own catalogue is there for `/insights`.
 * Switched on by the `data` flag (`/?proto=data`, kept in localStorage).
 */
import type { QueryClient } from "@tanstack/react-query";
import { contextPath, eventsPath } from "../../core/page-data";
import { ZONE_IDS, type ZoneId } from "../../core/zones";

const STORE = "sgc-swarm:api-v1";
const FETCHED_AT = "x-fetched-at";
/** Older than this, a stored answer is not drawn: the reader gets the skeleton and fresh data. */
export const MAX_AGE_MS = 7 * 24 * 3600_000;

export const PROTO_KEY = "sgc-swarm:proto";
export function proto(flag: string): boolean {
  try {
    return (localStorage.getItem(PROTO_KEY) ?? "").split(",").includes(flag);
  } catch {
    return false;
  }
}

/** What `/insights` cannot draw without: both catalogues and Chocó's USGS context. */
const INSIGHTS_KEYS: { path: string; key: [string, ZoneId] }[] = [
  ...ZONE_IDS.map((zone) => ({ path: eventsPath(zone), key: ["events", zone] as [string, ZoneId] })),
  { path: contextPath("choco"), key: ["context", "choco"] },
];
const kept = (path: string) => INSIGHTS_KEYS.some((k) => k.path === path);

/** Keeps an answer's text. Never throws: storage may be refused (private browsing) or full. */
export function remember(path: string, text: string): void {
  if (!kept(path) || !proto("data") || typeof caches === "undefined") return;
  const res = new Response(text, {
    headers: { "content-type": "application/json", [FETCHED_AT]: String(Date.now()) },
  });
  void caches
    .open(STORE)
    .then((c) => c.put(path, res))
    .catch(() => {});
}

async function recall(path: string): Promise<{ data: unknown; at: number } | null> {
  try {
    const res = await (await caches.open(STORE)).match(path);
    if (!res) return null;
    const at = Number(res.headers.get(FETCHED_AT));
    if (!(Date.now() - at < MAX_AGE_MS)) return null;
    return { data: await res.json(), at };
  } catch {
    return null;
  }
}

/** How old each stored answer is, in ms, or null where there is none. */
export async function storedAges(): Promise<Record<string, number | null>> {
  const found = await Promise.all(INSIGHTS_KEYS.map((k) => recall(k.path)));
  return Object.fromEntries(INSIGHTS_KEYS.map((k, i) => [k.path, found[i] ? Date.now() - found[i].at : null]));
}

/**
 * Puts the stored answers into the query cache, all or nothing, each with the time it was fetched,
 * so every query is stale and refetches on mount. True when the page can draw without the network.
 */
export async function seed(client: QueryClient): Promise<boolean> {
  if (!proto("data") || typeof caches === "undefined") return false;
  const t0 = performance.now();
  const found = await Promise.all(INSIGHTS_KEYS.map((k) => recall(k.path)));
  performance.measure("proto:seed", { start: t0, end: performance.now() });
  if (found.some((f) => f === null)) return false;
  try {
    localStorage.setItem("sgc-swarm:kept", String(Math.min(...found.map((f) => f!.at))));
  } catch {
    // Storage refused.
  }
  found.forEach((f, i) => client.setQueryData(INSIGHTS_KEYS[i]!.key, f!.data, { updatedAt: f!.at }));
  return true;
}

/**
 * From the monitor, once it is idle: fetch whatever `/insights` needs that the store lacks or holds
 * older than `fresh` ms, through `get` (the API client, which stores it).
 */
export async function warm(get: (path: string) => Promise<unknown>, fresh = 15 * 60_000): Promise<void> {
  if (!proto("data")) return;
  const ages = await storedAges();
  await Promise.all(
    Object.entries(ages)
      .filter(([, age]) => age === null || age > fresh)
      .map(([path]) => get(path).catch(() => {})),
  );
  // `remember` writes behind the answer: give it a moment before reading back.
  await new Promise((done) => setTimeout(done, 500));
  const after = Object.values(await storedAges());
  try {
    if (after.every((age) => age !== null)) {
      localStorage.setItem("sgc-swarm:kept", String(Date.now() - Math.max(...after.map((age) => age ?? 0))));
    }
  } catch {
    // Storage refused.
  }
}
