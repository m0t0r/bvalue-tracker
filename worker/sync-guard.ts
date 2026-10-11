/**
 * The code that guards "Sincronizar ahora" (POST /api/refresh), the one route that reaches SGC.
 *
 * A 4-digit code is 10,000 guesses, so it is only as good as the lockout behind it: three wrong codes
 * in a row from one caller lock that caller out of syncing for 15 minutes, the right code included.
 * The code lives in D1 (`sync_code`, set by the owner; docs/deployment.md), never in the repo, which
 * is public. Until it is set every sync is refused: the guard fails closed.
 *
 * **One statement decides.** The lock check, the comparison and the counter's move are a single upsert
 * (D1 runs one statement at a time), so a burst of parallel guesses cannot each be compared before the
 * counter moves: the fourth of four simultaneous wrong codes already finds the lock.
 *
 * The caller is its address as Cloudflare saw it (`cf-connecting-ip`, the rate limiter's key), hashed
 * before it is stored or logged, and an IPv6 address by its /48: a /64 is one subscriber's, but a /48
 * comes free with a tunnel broker, and keyed by /64 it was 65,536 callers with three tries each, every
 * code in one lock's time (code review). See docs/security.md.
 */
import type { SyncRefusal } from "./api-types.ts";

export { SYNC_CODE_HEADER } from "./api-types.ts";

/** Wrong codes in a row that lock a caller out. */
export const MAX_FAILURES = 3;
/** How long a lock lasts. */
export const LOCKOUT_S = 15 * 60;
/** A caller's row untouched this long is deleted, at the next press whose code is accepted. */
const PURGE_AFTER_MS = 24 * 3600 * 1000;

const FOUR_DIGITS = /^\d{4}$/;

/**
 * What the guard made of one request's code: through, or a refusal with the body the page reads
 * (`SyncRefusal`). Every refusal is answered before anything reads the run history. `ipHash` is there
 * when the code was looked at, for the log; `lockedNow` when this very request's wrong code set the lock.
 */
export type Verdict =
  | { ok: true; ipHash: string }
  | {
      ok: false;
      status: 400 | 401 | 403 | 429 | 503;
      body: SyncRefusal;
      ipHash?: string;
      lockedNow?: boolean;
    };

/**
 * The key a caller's attempts are counted under: an IPv6 address by its first three groups (its /48),
 * anything else as it comes. `cf-connecting-ip` is absent only off Cloudflare (local dev, tests).
 */
export function callerKey(ip: string | undefined): string {
  if (ip === undefined || ip === "") return "unknown";
  if (!ip.includes(":")) return ip;
  const [head = "", tail] = ip.toLowerCase().split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  // An embedded IPv4 tail (`::ffff:192.0.2.1`) or anything else unexpected: key it whole.
  // Too many groups for its `::` is malformed too.
  if (
    [...left, ...right].some((g) => !/^[0-9a-f]{1,4}$/.test(g)) ||
    (tail === undefined ? left.length !== 8 : left.length + right.length > 7)
  )
    return ip.toLowerCase();
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return `${groups
    .slice(0, 3)
    .map((g) => g.padStart(4, "0"))
    .join(":")}::/48`;
}

/** SHA-256 of the caller's key, hex, first 32 characters (128 bits): what is stored and logged, never the address. */
async function hashCaller(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The one statement. `?1` the caller, `?2` the code sent, `?3` now, `?4` when a lock set now would end,
 * `?5` this request's id. `hit` is the stored code equal to the one sent, NULL with no stored code;
 * `stale` is the code before the owner's last change (a page still holding it).
 *
 * - Locked (`locked_until > now`): nothing changes; the right code is refused too.
 * - No code set, or the previous one: nothing changes.
 * - The right code: `failures` back to 0.
 * - A wrong one: `failures + 1`, and at `MAX_FAILURES` the lock is set, `locked_by` names this request
 *   and `failures` goes back to 0, so after the 15 minutes three more count afresh.
 *
 * A caller's first code inserts its row with the same outcome a wrong or right code would give an
 * existing one at 0 failures (`MAX_FAILURES` is more than 1, so a first guess never locks).
 */
const DECIDE = `
WITH sent AS (
  SELECT c.code = ?2 AS hit, coalesce(c.previous_code = ?2, 0) AS stale
  FROM (SELECT 1) LEFT JOIN sync_code c ON c.id = 1
)
INSERT INTO sync_lockouts (ip_hash, failures, locked_until, updated_at)
SELECT ?1, CASE WHEN hit IS NULL OR hit OR stale THEN 0 ELSE 1 END, NULL, ?3 FROM sent WHERE true
ON CONFLICT(ip_hash) DO UPDATE SET
  failures = CASE
    WHEN locked_until > ?3 OR (SELECT hit IS NULL OR stale FROM sent) THEN failures
    WHEN (SELECT hit FROM sent) THEN 0
    WHEN failures + 1 >= ${MAX_FAILURES} THEN 0
    ELSE failures + 1
  END,
  locked_by = CASE
    WHEN locked_until > ?3 OR (SELECT hit IS NULL OR stale OR hit FROM sent) THEN locked_by
    WHEN failures + 1 >= ${MAX_FAILURES} THEN ?5
    ELSE locked_by
  END,
  locked_until = CASE
    WHEN locked_until > ?3 OR (SELECT hit IS NULL OR stale FROM sent) THEN locked_until
    WHEN (SELECT hit FROM sent) THEN NULL
    WHEN failures + 1 >= ${MAX_FAILURES} THEN ?4
    ELSE NULL
  END,
  updated_at = ?3
RETURNING failures, locked_until AS lockedUntil, coalesce(locked_by = ?5, 0) AS lockedNow,
  (SELECT hit FROM sent) AS hit, (SELECT stale FROM sent) AS stale`;

/**
 * Checks the code a request to POST /api/refresh carries. Refusals that are not a guess (no header, not
 * four digits, no code set, the code before the owner's last change) count nothing; a wrong code counts;
 * a locked caller is refused whatever it sends.
 */
export async function checkSyncCode(
  db: D1Database,
  sent: string | undefined,
  ip: string | undefined,
  now: Date,
): Promise<Verdict> {
  if (sent === undefined) return { ok: false, status: 401, body: { error: "sync code required" } };
  if (!FOUR_DIGITS.test(sent)) return { ok: false, status: 400, body: { error: "sync code must be 4 digits" } };
  const ipHash = await hashCaller(callerKey(ip));
  const nowIso = now.toISOString();
  const lockEnd = new Date(now.getTime() + LOCKOUT_S * 1000).toISOString();
  const row = await db
    .prepare(DECIDE)
    .bind(ipHash, sent, nowIso, lockEnd, crypto.randomUUID())
    .first<{ failures: number; lockedUntil: string | null; lockedNow: number; hit: number | null; stale: number }>();
  if (row === null) throw new Error("sync guard: the upsert returned no row");
  if (row.lockedUntil !== null && row.lockedUntil > nowIso) {
    const retryAfterS = Math.max(1, Math.ceil((Date.parse(row.lockedUntil) - now.getTime()) / 1000));
    return {
      ok: false,
      status: 429,
      body: { error: "too many wrong sync codes", retryAfterS },
      ipHash,
      lockedNow: row.lockedNow === 1,
    };
  }
  if (row.hit === null) return { ok: false, status: 503, body: { error: "sync code not set" } };
  if (row.stale === 1) return { ok: false, status: 401, body: { error: "sync code changed" }, ipHash };
  if (row.hit === 0)
    return {
      ok: false,
      status: 403,
      body: { error: "wrong sync code", attemptsLeft: MAX_FAILURES - row.failures },
      ipHash,
    };
  return { ok: true, ipHash };
}

/** Deletes the rows of callers who have sent no code for a day and are not locked: no address is kept longer than it counts. */
export function purgeIdleCallers(db: D1Database, now: Date): Promise<unknown> {
  const nowIso = now.toISOString();
  return db
    .prepare("DELETE FROM sync_lockouts WHERE updated_at < ? AND (locked_until IS NULL OR locked_until <= ?)")
    .bind(new Date(now.getTime() - PURGE_AFTER_MS).toISOString(), nowIso)
    .run();
}
