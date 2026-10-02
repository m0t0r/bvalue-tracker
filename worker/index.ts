import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { toCsv, windowsToCsv, type CsvLang } from "../core/csv.ts";
import { clusterOf, computeClusterStats, type Cluster } from "../core/clusters.ts";
import { computeStats, type CatalogStats } from "@bvalue/seismo";
import { ZONE_PATHS } from "../core/zone-pages.ts";
import { DEFAULT_ZONE, ZONE_IDS, isZoneId, type ZoneId } from "../core/zones.ts";
import type {
  ContextResponse,
  HealthResponse,
  SeaForecast,
  StatusResponse,
  StoredEvent,
  ZoneHealth,
} from "./api-types.ts";
import { lastRun, toStored, zoneMainshockRow, type EventRow } from "./db.ts";
import { PRODUCTS_CRON, readContext, refreshProducts } from "./external.ts";
import { backfillProgress, readHistory, runPlan } from "./ingest.ts";
import { asLevel, logger, type Logger } from "./log.ts";
import { INGEST_CRON, dueNow, sgcUnwell, tickMinute } from "./plan.ts";
import { redirectTo } from "./redirect/index.ts";
import { readSea, refreshSea } from "./sea.ts";

const app = new Hono<{ Bindings: Env }>();

/**
 * This invocation's logger. `LOG_LEVEL` is a var in wrangler.jsonc, so turning `debug` on
 * for an investigation is a one-line deploy and turning it back off cannot be forgotten in
 * some call site. The read routes deliberately do not use this: their status and CPU time
 * are already in the invocation log Cloudflare writes for every request, and a second line
 * per request would spend the free plan's 200,000/day on something we already have.
 */
const log = (env: Env, bindings: Record<string, unknown> = {}): Logger => logger(bindings, asLevel(env.LOG_LEVEL));

/**
 * The page's own fetches carry Sec-Fetch-Site: same-origin; a cross-site page's do not.
 * A caller that sends neither Sec-Fetch-Site nor Origin (curl, a script) has no positive
 * same-origin signal and is refused: that is the point, since the catalogue routes are
 * what we are keeping off direct callers. Headers are forgeable and this is not an
 * authentication boundary; it keeps the raw data out of casual reach, nothing more.
 */
/**
 * PageSpeed Insights' runner sends neither Sec-Fetch-Site nor Origin, so without this it only ever
 * scores the page's load-error state (docs/performance.md). Both halves are required: the user
 * agent says Lighthouse, which anyone can claim, and Cloudflare's `verifiedBotCategory` says the
 * request comes from a bot Cloudflare has verified by its network, which a caller cannot set.
 * The category is missing from the generated `cf` types, hence the cast. Reads only: refresh is
 * the route that reaches SGC, and nothing in a page load needs it.
 */
function isVerifiedLighthouse(c: Context<{ Bindings: Env }>): boolean {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return false;
  const cf = c.req.raw.cf as { verifiedBotCategory?: unknown } | undefined;
  if (typeof cf?.verifiedBotCategory !== "string" || cf.verifiedBotCategory === "") return false;
  return c.req.header("user-agent")?.includes("Chrome-Lighthouse") ?? false;
}

function isSameOrigin(c: Context<{ Bindings: Env }>): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site !== undefined) return site === "same-origin";
  const origin = c.req.header("origin");
  if (origin === undefined) return false;
  try {
    return new URL(origin).origin === new URL(c.req.url).origin;
  } catch {
    return false;
  }
}

/**
 * The page's own security headers come from public/_headers, which is the static-asset
 * layer; /api/* runs worker-first and never passes through it, and neither does the 404 for
 * a path that matches no asset. Hono's defaults, set after the handler, so 403s, 429s, 404s
 * and 500s carry them too. The one override is HSTS: the same two-year promise the page
 * makes, since a host makes it once, for every response. No CSP or Permissions-Policy: a
 * JSON or plain-text body renders nothing for them to govern.
 */
app.use("*", secureHeaders({ strictTransportSecurity: "max-age=63072000; includeSubDomains; preload" }));

/**
 * Rate limit first, then the origin check: a caller that ignores both still cannot
 * spend more than its share of D1 reads and Worker CPU. Every read route does a
 * full-table scan and /api/stats recomputes the whole fit, so volume is the cost.
 *
 * /api/health stays open on purpose: it is the deploy smoke test's target and carries
 * no catalogue data. Everything else under /api/ is for the page itself.
 */
app.use("/api/*", async (c, next) => {
  const key = c.req.header("cf-connecting-ip") ?? "unknown";
  const { success } = await c.env.API_RATE_LIMIT.limit({ key });
  if (!success) {
    c.header("cache-control", "no-store");
    c.header("retry-after", "60");
    return c.json({ error: "rate limited" }, 429);
  }
  if (c.req.path === "/api/health" || isSameOrigin(c) || isVerifiedLighthouse(c)) return next();
  c.header("cache-control", "no-store");
  return c.json({ error: "forbidden" }, 403);
});

/**
 * Liveness for CI and uptime checks: the Worker answered and D1 is readable.
 *
 * It also carries how long ago ingest last succeeded, because this is the only route open
 * to a caller without a same-origin signal and therefore the only thing an external alarm
 * can ask. That number is what the two real outages had in common: the Worker was up, the
 * page rendered, `/api/health` would have said `ok`, and the catalogue was nine hours
 * stale. `ingestAgeS` is the field to alert on — see .github/workflows/ingest-health.yml.
 *
 * Per zone, because each zone is its own catalogue and a stale one is a fault even while the
 * other is fresh. The top-level `ingestAgeS` is the **stalest** zone's, and null while any zone
 * has never succeeded, so an alarm that reads only that field still fires for either zone.
 *
 * Still no catalogue data: an age and a count say nothing about any event.
 */
app.get("/api/health", async (c) => {
  const db = c.env.DB;
  const ageS = (r: { finishedAt: string | null } | null) =>
    r?.finishedAt == null ? null : Math.max(0, Math.round((Date.now() - Date.parse(r.finishedAt)) / 1000));
  // Independent reads, so they go together rather than one round trip after another.
  const [last, ...perZone] = await Promise.all([
    lastRun(db, false, null),
    ...ZONE_IDS.map(async (zone): Promise<ZoneHealth> => {
      const [agg, lastOfZone, okOfZone] = await Promise.all([
        db.prepare("SELECT COUNT(*) AS n FROM events WHERE zone = ?").bind(zone).first<{ n: number }>(),
        lastRun(db, false, zone),
        lastRun(db, true, zone),
      ]);
      return {
        totalEvents: agg?.n ?? 0,
        ingestAgeS: ageS(okOfZone),
        lastRunOk: lastOfZone === null ? null : lastOfZone.ok,
      };
    }),
  ]);
  const zones = Object.fromEntries(ZONE_IDS.map((z, i) => [z, perZone[i]!])) as Record<ZoneId, ZoneHealth>;
  const ages = ZONE_IDS.map((z) => zones[z].ingestAgeS);
  c.header("cache-control", "no-store");
  return c.json({
    ok: true,
    totalEvents: ZONE_IDS.reduce((n, z) => n + zones[z].totalEvents, 0),
    /** The stalest zone's seconds since ingest last succeeded. null while any zone never has. */
    ingestAgeS: ages.some((a) => a === null) ? null : Math.max(...(ages as number[])),
    /** Whether the most recent finished run, of any zone, succeeded. null when none has. */
    lastRunOk: last === null ? null : last.ok,
    zones,
  } satisfies HealthResponse);
});

interface EventFilter {
  from?: string;
  to?: string;
  minMag?: number;
  status?: "manual" | "automatic";
  includeRemoved: boolean;
  excludeMainshock: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = (s: string | undefined) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined);
/** `to` is inclusive: a bare date means "through the end of that day", as in the page's filter. */
const isoDateTo = (s: string | undefined) =>
  s && DATE_ONLY.test(s) ? new Date(Date.parse(`${s}T00:00:00Z`) + 86_400_000).toISOString() : isoDate(s);

function parseFilter(q: Record<string, string>): EventFilter {
  const minMag = q.minMag !== undefined ? Number(q.minMag) : undefined;
  return {
    from: isoDate(q.from),
    to: isoDateTo(q.to),
    minMag: minMag !== undefined && Number.isFinite(minMag) ? Math.min(Math.max(minMag, 0), 10) : undefined,
    status: q.status === "manual" || q.status === "automatic" ? q.status : undefined,
    includeRemoved: q.includeRemoved === "1",
    excludeMainshock: q.excludeMainshock === "1",
  };
}

/** `zone=choco|tolima`; none means Chocó, which every URL from before there were two assumes. */
function parseZone(q: Record<string, string>): ZoneId {
  if (q.zone === undefined || q.zone === "") return DEFAULT_ZONE;
  if (isZoneId(q.zone)) return q.zone;
  throw new HTTPException(400, { message: `zone must be one of ${ZONE_IDS.join(", ")}` });
}

/**
 * The most events one read route answers from. Every read route serves the zone's whole filtered
 * catalogue, and the statistics need all of it, so this is a ceiling that fails out loud, never a
 * page size: an answer from the first 20,000 events would be a confident, wrong b-value. No filter
 * can widen a query past the zone's catalogue, so what it guards is the catalogue's own growth.
 * 20,000 is ~18 times Tolima's 1,109 events of 2026-10-02, and holds a request to ~30 MB of the
 * isolate's 128 (~1.4 KB a row as rows, events and JSON, measured in V8). The CPU budget meets a
 * catalogue first: see docs/security.md.
 */
export const READ_ROW_CEILING = 20_000;

/** A read past `READ_ROW_CEILING`, answered by `onError` with a 500 that says so. */
class CatalogueTooLarge extends Error {
  constructor(readonly zone: ZoneId) {
    super(
      `the catalogue has grown past ${READ_ROW_CEILING} events, more than one answer serves; narrow it with from and to`,
    );
    this.name = "CatalogueTooLarge";
  }
}

async function queryEvents(db: D1Database, f: EventFilter, zone: ZoneId): Promise<StoredEvent[]> {
  const where: string[] = ["zone = ?"];
  const args: (string | number)[] = [zone];
  if (!f.includeRemoved) where.push("removed_at IS NULL");
  if (f.from) {
    where.push("time >= ?");
    args.push(f.from);
  }
  if (f.to) {
    where.push("time < ?");
    args.push(f.to);
  }
  if (f.minMag !== undefined) {
    where.push("mag >= ?");
    args.push(f.minMag);
  }
  if (f.status) {
    where.push("status = ?");
    args.push(f.status);
  }
  // One row past the ceiling is how a read knows it was reached, without counting first.
  const sql = `SELECT * FROM events WHERE ${where.join(" AND ")} ORDER BY time LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...args, READ_ROW_CEILING + 1)
    .all<EventRow>();
  if (results.length > READ_ROW_CEILING) throw new CatalogueTooLarge(zone);
  const events = results.map(toStored);
  if (!f.excludeMainshock) return events;
  const mainshock = await zoneMainshockRow(db, zone);
  return mainshock === null ? events : events.filter((e) => e.id !== mainshock.id);
}

async function status(db: D1Database, zone: ZoneId): Promise<StatusResponse> {
  const agg = await db
    .prepare("SELECT COUNT(*) AS n FROM events WHERE zone = ? AND removed_at IS NULL")
    .bind(zone)
    .first<{ n: number }>();
  // In its own query rather than as bare columns beside MAX(time): SQLite would answer that, but
  // only while exactly one min/max aggregate is in the statement. One indexed row (events_zone_time,
  // walked backwards) costs less than that rule being broken silently later.
  const newest = await db
    .prepare(
      "SELECT id, time, mag, region FROM events WHERE zone = ? AND removed_at IS NULL ORDER BY time DESC LIMIT 1",
    )
    .bind(zone)
    .first<{ id: string; time: string; mag: number; region: string }>();
  return {
    totalEvents: agg?.n ?? 0,
    newestEvent: newest,
    lastRun: await lastRun(db, false, zone),
    lastSuccessfulRun: await lastRun(db, true, zone),
    backfill: await backfillProgress(db, new Date(), zone),
  };
}

app.get("/api/status", async (c) => {
  const zone = parseZone(c.req.query());
  c.header("cache-control", "no-cache");
  return c.json(await status(c.env.DB, zone));
});

/** `cluster=shallow|deep` narrows a response to one depth cluster. Anything else is refused rather than silently ignored. */
function parseCluster(q: Record<string, string>): Cluster | null {
  if (q.cluster === undefined || q.cluster === "") return null;
  if (q.cluster === "shallow" || q.cluster === "deep") return q.cluster;
  throw new HTTPException(400, { message: "cluster must be shallow or deep" });
}
const ofCluster = (events: StoredEvent[], cluster: Cluster | null) =>
  cluster === null ? events : events.filter((e) => clusterOf(e) === cluster);

app.get("/api/events", async (c) => {
  const q = c.req.query();
  const events = ofCluster(await queryEvents(c.env.DB, parseFilter(q), parseZone(q)), parseCluster(q));
  // Always revalidate: the page refetches right after a refresh and must not get the old body.
  c.header("cache-control", "no-cache");
  return c.json(events);
});

// CSV headers stay in the stable machine form unless a reader asks for Spanish with ?lang=es.
const csvLang = (q: Record<string, string>): CsvLang => (q.lang === "es" ? "es" : "en");

app.get("/api/events.csv", async (c) => {
  const q = c.req.query();
  const zone = parseZone(q);
  const events = ofCluster(await queryEvents(c.env.DB, parseFilter(q), zone), parseCluster(q));
  return c.body(toCsv(events, csvLang(q)), 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="sgc-${zone}-events.csv"`,
    "cache-control": "no-cache",
  });
});

const givenMc = (q: Record<string, string>): number | null =>
  q.mc !== undefined && Number.isFinite(Number(q.mc)) ? Number(q.mc) : null;

/**
 * A cluster's statistics come from computeClusterStats, never from computeStats on the cluster's own
 * events: that would give the cluster its own Mc, and the page, which shares one Mc, would disagree.
 */
async function statsFor(db: D1Database, q: Record<string, string>): Promise<CatalogStats> {
  const cluster = parseCluster(q);
  const events = await queryEvents(db, parseFilter(q), parseZone(q));
  return cluster === null ? computeStats(events, givenMc(q)) : computeClusterStats(events, givenMc(q))[cluster].stats;
}

app.get("/api/stats", async (c) => {
  const stats = await statsFor(c.env.DB, c.req.query());
  c.header("cache-control", "no-cache");
  return c.json(stats);
});

app.get("/api/b-windows.csv", async (c) => {
  const q = c.req.query();
  return c.body(windowsToCsv((await statsFor(c.env.DB, q)).windows, csvLang(q)), 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="sgc-${parseZone(q)}-b-windows.csv"`,
    "cache-control": "no-cache",
  });
});

/**
 * What USGS publishes about the zone's mainshock, as the daily job last stored it: felt reports,
 * modelled shaking and the aftershock forecast, each with its source times. Never fetched on a
 * request; one primary-key read. A digest carries the SGC mainshock it was matched from, and the page
 * shows it only while that is still the zone's detected mainshock.
 */
app.get("/api/context", async (c) => {
  const zone = parseZone(c.req.query());
  c.header("cache-control", "no-cache");
  return c.json((await readContext(c.env.DB, zone)) satisfies ContextResponse);
});

/**
 * The sea state the 3D block draws: Open-Meteo's marine forecast, as the daily job last stored it.
 * Never fetched on a request; one primary-key read. Null before the first run.
 */
app.get("/api/sea", async (c) => {
  c.header("cache-control", "no-cache");
  return c.json((await readSea(c.env.DB)) satisfies SeaForecast | null);
});

app.post("/api/refresh", async (c) => {
  const db = c.env.DB;
  const now = new Date();
  const zone = parseZone(c.req.query());
  const l = log(c.env, { trigger: "manual", zone });
  const standDown = async (retryAfterS: number, why: string) => {
    // A press that stands down is the normal case with a 5-minute cron, so this is not a
    // warning. It is logged because "the button does nothing" is the report we would get,
    // and the reason it did nothing is otherwise nowhere.
    l.info({ retryAfterS, why }, "refresh stood down");
    return c.json({ ...(await status(db, zone)), refreshed: false, retryAfterS } satisfies StatusResponse);
  };

  // One reading of the run history, one decision from it. The checks inside dueNow only
  // answer with a useful retryAfterS; the guard that actually holds is the atomic claim,
  // which the plan's minIntervalS carries into ingest().
  const history = await readHistory(db, now, l, zone);
  const plan = dueNow({ kind: "manual" }, now, history, zone);
  if (plan.steps.length === 0) {
    return standDown(plan.retryAfterS ?? 5, history.inFlight ? "in flight" : "throttled");
  }

  const work = runPlan({ db, log: l, analytics: c.env.INGEST_ANALYTICS }, plan, zone);
  // Keep the ingest alive if the visitor closes the tab mid-request.
  c.executionCtx.waitUntil(work);
  // null means a concurrent caller won the claim, so nothing was sent to SGC.
  if ((await work) === null) return standDown(5, "claim held");
  return c.json({ ...(await status(db, zone)), refreshed: true } satisfies StatusResponse);
});

/**
 * What broke in the reader's browser.
 *
 * The page's own failures were the one part of this system with no record at all: a
 * MapLibre worker that never loads, a chart that throws, a chunk that 404s after a deploy
 * all leave the reader with a broken page and leave us with nothing. This is the smallest
 * thing that fixes that — it writes a log line and touches no storage.
 *
 * It is **not** an open endpoint: it sits under /api/*, so the same-origin check and the
 * 120/minute per-IP rate limit already apply to it exactly as they do to /api/events. A
 * caller with no same-origin signal gets 403 before this handler runs.
 */
const CLIENT_ERROR_MAX_BYTES = 4096;

/**
 * The cap holds before the handler reads a byte: a declared Content-Length over it is refused
 * unread, and a chunked body is abandoned the moment it crosses it rather than buffered first.
 */
const clientErrorLimit = bodyLimit({
  maxSize: CLIENT_ERROR_MAX_BYTES,
  onError: (c) => c.body(null, 413, { "cache-control": "no-store" }),
});

app.post("/api/client-error", clientErrorLimit, async (c) => {
  c.header("cache-control", "no-store");

  let sent: unknown;
  try {
    sent = await c.req.json();
  } catch {
    return c.json({ error: "bad report" }, 400);
  }
  if (typeof sent !== "object" || sent === null) return c.json({ error: "bad report" }, 400);

  // Only these four fields are read, and each only if it is a string: whatever else the
  // body carried is dropped here rather than logged. A log line is a place a reader's
  // browser can put text, so the field list is a closed one.
  const { message, stack, source, path } = sent as Record<string, unknown>;
  if (typeof message !== "string" || message === "") return c.json({ error: "bad report" }, 400);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  // Nested, so the dashboard can filter on `page.message`. The logger's own string cap is a
  // shallow pass and does not reach in here, so each field is bounded where it comes in: the
  // four from the body by the 4 KB cap above, and the user-agent — which is a header, and so
  // never passed through that cap — right here.
  log(c.env).warn(
    {
      page: {
        message,
        stack: str(stack),
        source: str(source),
        path: str(path),
        userAgent: c.req.header("user-agent")?.slice(0, 512),
      },
    },
    "page error",
  );
  return c.body(null, 204);
});

/**
 * An unknown /api/ path answers in JSON, like the rest of the API. Anything else only reaches
 * the Worker when the asset layer found no file for it (`not_found_handling: "none"`), so it is
 * a real 404 and says so, rather than handing back the whole page with a 200 and letting a
 * crawler believe the path exists. The /api/* middleware runs before this, so an unknown API
 * path is still rate limited and origin checked.
 */
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
  c.header("cache-control", "no-store");
  return c.text("not found\n", 404);
});

app.onError((err, c) => {
  // A refusal a route chose to make, such as a bad `cluster`: its status and message, not a 500.
  if (err instanceof HTTPException) {
    c.header("cache-control", "no-store");
    return c.json({ error: err.message }, err.status);
  }
  // Not a bug in a route but the catalogue outgrowing them: its own line, and words that say so.
  if (err instanceof CatalogueTooLarge) {
    log(c.env).error(
      { zone: err.zone, ceiling: READ_ROW_CEILING, path: c.req.path },
      "read route over its row ceiling",
    );
    c.header("cache-control", "no-store");
    return c.json({ error: err.message }, 500);
  }
  // The route is on the line because a 500 with no path is a 500 you cannot reproduce.
  // `err` is flattened by the logger, so the stack survives JSON — `console.error(err)`
  // alone gave Workers Logs an object that serialises to `{}`.
  log(c.env).error({ err, method: c.req.method, path: c.req.path }, "unhandled error");
  c.header("cache-control", "no-store");
  return c.json({ error: "internal error" }, 500);
});

/**
 * The site moved from the Worker's workers.dev name to bvalue.site on 2026-10-02. A workers.dev
 * hostname is outside any zone, so no Redirect Rule can reach it; only this Worker can. The pages
 * run worker-first for this alone (`run_worker_first` in wrangler.jsonc): on the old name they get a
 * 301 to the same path and query on the domain, and everywhere else they go to the asset layer
 * untouched, before Hono, so `secureHeaders()` never mixes into the headers `public/_headers` sets.
 * The API is not redirected: a tab still open on the old name keeps working, and a 301 would turn
 * its `POST /api/refresh` into a `GET`.
 */
export function movedPage(
  request: Request,
  env: { CANONICAL_ORIGIN: string; WORKERS_DEV_HOST: string },
): string | null {
  const url = new URL(request.url);
  if (url.hostname !== env.WORKERS_DEV_HOST || url.pathname.startsWith("/api/")) return null;
  // A copy with no domain of its own names its workers.dev host as both; a 301 to itself would loop.
  if (new URL(env.CANONICAL_ORIGIN).hostname === url.hostname) return null;
  return redirectTo(request.url, env.CANONICAL_ORIGIN);
}

/** The pages `run_worker_first` sends here; any other path outside /api/ is an asset miss, for Hono's 404. */
const PAGES = new Set([...Object.values(ZONE_PATHS), "/insights"]);

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const moved = movedPage(request, env);
    if (moved !== null) return Response.redirect(moved, 301);
    if (PAGES.has(new URL(request.url).pathname)) return env.ASSETS.fetch(request);
    return app.fetch(request, env, ctx);
  },
  /**
   * Every lane hangs off the one cron, and is chosen from the tick rather than from a
   * pattern of its own. At the five-minute cadence a second pattern was provably unsafe —
   * the furthest a non-multiple-of-5 minute can sit from a tick is 120 s, inside
   * IN_FLIGHT_MS (150 s), so the two kept landing in each other's claim window, dropping a
   * run silently in one direction and querying SGC twice at once in the other. At fifteen
   * minutes that particular arithmetic no longer bites, but the rule stays: one pattern has
   * no spacing to get wrong, and the cadence is a constant that moves. Running the lanes in
   * sequence in one invocation is race-free by construction.
   */
  async scheduled(controller, env) {
    // The daily USGS job is its own invocation with its own CPU, and never touches SGC.
    // The sea state rides on the same invocation, after USGS: one small request, and either failing
    // leaves the other to run. The first failure is rethrown, so the invocation is recorded as failed.
    if (controller.cron === PRODUCTS_CRON) {
      const now = new Date(controller.scheduledTime);
      let failed: unknown = null;
      try {
        await refreshProducts({ db: env.DB, log: log(env, { trigger: "usgs" }), now });
      } catch (err) {
        failed = err;
      }
      try {
        await refreshSea({ db: env.DB, log: log(env, { trigger: "sea" }), now });
      } catch (err) {
        failed ??= err;
      }
      if (failed !== null) throw failed;
      return;
    }
    if (controller.cron !== INGEST_CRON) {
      // A pattern in wrangler.jsonc that no branch here answers. Running the ingest for it would
      // be an unplanned request to SGC, at a minute the lanes were never designed for.
      log(env, { trigger: "cron" }).error({ cron: controller.cron }, "unknown cron pattern");
      return;
    }
    const minute = tickMinute(controller.scheduledTime);
    const l = log(env, { trigger: "cron", tickMinute: minute });
    // The zones one after another, in this one invocation: never two requests to SGC at once,
    // and no second cron pattern to land inside the first one's claim window. Each zone reads
    // the history afresh, so the second sees what the first just did — a refusal the first
    // zone met holds the second one's probe to the same hour.
    let thrown: unknown = null;
    for (const zone of ZONE_IDS) {
      const zl = l.child({ zone });
      try {
        // The real clock, not the scheduled minute: a failure recorded seconds ago still counts
        // against the fast lane, while which lane this tick *is* comes from scheduledTime.
        const now = new Date();
        const history = await readHistory(env.DB, now, zl, zone);
        const plan = dueNow({ kind: "cron", scheduledTime: controller.scheduledTime }, now, history, zone);
        /**
         * The line that would have caught the tickMinute fault in one query. `lanes` is what
         * this tick decided to do; grouping 24 hours of these by it should show four fast
         * ticks for every wide one and a sweep on the hour. For a day it was `["fast"]` every
         * single time and nothing said so. `scheduledAt` is on the line too, because the
         * dispatch is at :45 past and that offset is the whole reason the snap exists.
         */
        zl.info(
          {
            scheduledAt: new Date(controller.scheduledTime).toISOString(),
            lanes: plan.steps.map((s) => s.lane),
            sgcUnwell: sgcUnwell(history.health, now),
            backfill: `${history.backfill.done}/${history.backfill.total}`,
            inFlight: history.inFlight,
          },
          plan.steps.length === 0 ? "tick stood down" : "tick planned",
        );

        await runPlan({ db: env.DB, log: zl, analytics: env.INGEST_ANALYTICS }, plan, zone);
      } catch (err) {
        // A throw here is otherwise only an uncaught-exception log with no idea which lane
        // it was in. Logged with the tick's own fields, and rethrown once every zone has had
        // its turn, so the runtime still records the invocation as failed but one zone's
        // fault does not also cost the other zone its tick.
        zl.error({ err }, "tick failed");
        thrown ??= err;
      }
    }
    if (thrown !== null) throw thrown;
  },
} satisfies ExportedHandler<Env>;
