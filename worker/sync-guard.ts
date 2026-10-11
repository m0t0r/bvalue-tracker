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
 * before it is stored or logged, and an IPv6 address by its /64, which one subscriber usually holds
 * whole: per address, a /64 would be 2^64 lockouts to walk through. See docs/security.md.
 */

export { SYNC_CODE_HEADER } from "./api-types.ts";

/** Wrong codes in a row that lock a caller out. */
export const MAX_FAILURES = 3;
/** How long a lock lasts. */
export const LOCKOUT_S = 15 * 60;
/** A caller's row untouched this long is deleted, the next time anyone's code is accepted. */
const PURGE_AFTER_MS = 24 * 3600 * 1000;

const FOUR_DIGITS = /^\d{4}$/;

/** What the guard made of one request's code. Every refusal is answered before anything reads the run history. */
export type Verdict =
  | { ok: true; ipHash: string }
  /** No header at all: a tab from before the guard, or a caller that never asked. Not counted. */
  | { ok: false; status: 401; error: "sync code required" }
  /** A header that is not four digits. Not counted: it is not a guess at the code. */
  | { ok: false; status: 400; error: "sync code must be 4 digits" }
  /** A wrong code, counted. */
  | { ok: false; status: 403; error: "wrong sync code"; attemptsLeft: number; ipHash: string }
  /** Locked out, by this code or earlier ones. */
  | {
      ok: false;
      status: 429;
      error: "too many wrong sync codes";
      retryAfterS: number;
      ipHash: string;
      lockedNow: boolean;
    }
  /** The owner has not set a code yet. Not counted. */
  | { ok: false; status: 503; error: "sync code not set" };

/**
 * The key a caller's attempts are counted under: an IPv6 address by its first four groups (its /64),
 * anything else as it comes. `cf-connecting-ip` is absent only off Cloudflare (local dev, tests).
 */
export function callerKey(ip: string | undefined): string {
  if (ip === undefined || ip === "") return "unknown";
  if (!ip.includes(":")) return ip;
  const [head = "", tail] = ip.toLowerCase().split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  // An embedded IPv4 tail (`::ffff:192.0.2.1`) or anything else unexpected: key it whole.
  if ([...left, ...right].some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip.toLowerCase();
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.padStart(4, "0"))
    .join(":")}::/64`;
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
 * The one statement. `?1` the caller, `?2` the code sent, `?3` now, `?4` when a lock set now would end.
 * `hit` is the stored code equal to the one sent; with no stored code it is NULL, and nothing moves.
 *
 * - Locked (`locked_until > now`): nothing changes; the right code is refused too.
 * - No code set: nothing changes.
 * - The right code: `failures` back to 0.
 * - A wrong one: `failures + 1`, and at `MAX_FAILURES` the lock is set and `failures` goes back to 0,
 *   so after the 15 minutes three more count afresh.
 *
 * A caller's first code inserts its row with the same outcome a wrong or right code would give an
 * existing one at 0 failures (`MAX_FAILURES` is more than 1, so a first guess never locks).
 */
const DECIDE = `
WITH sent AS (SELECT (SELECT code FROM sync_code WHERE id = 1) = ?2 AS hit)
INSERT INTO sync_lockouts (ip_hash, failures, locked_until, updated_at)
SELECT ?1, CASE WHEN hit IS NULL OR hit THEN 0 ELSE 1 END, NULL, ?3 FROM sent WHERE true
ON CONFLICT(ip_hash) DO UPDATE SET
  failures = CASE
    WHEN locked_until > ?3 OR (SELECT hit FROM sent) IS NULL THEN failures
    WHEN (SELECT hit FROM sent) THEN 0
    WHEN failures + 1 >= ${MAX_FAILURES} THEN 0
    ELSE failures + 1
  END,
  locked_until = CASE
    WHEN locked_until > ?3 OR (SELECT hit FROM sent) IS NULL THEN locked_until
    WHEN (SELECT hit FROM sent) THEN NULL
    WHEN failures + 1 >= ${MAX_FAILURES} THEN ?4
    ELSE NULL
  END,
  updated_at = ?3
RETURNING failures, locked_until AS lockedUntil, (SELECT hit FROM sent) AS hit`;

/**
 * Checks the code a request to POST /api/refresh carries. Refusals that are not a guess (no header, not
 * four digits, no code set) count nothing; a wrong code counts; a locked caller is refused whatever it sends.
 */
export async function checkSyncCode(
  db: D1Database,
  sent: string | undefined,
  ip: string | undefined,
  now: Date,
): Promise<Verdict> {
  if (sent === undefined) return { ok: false, status: 401, error: "sync code required" };
  if (!FOUR_DIGITS.test(sent)) return { ok: false, status: 400, error: "sync code must be 4 digits" };
  const ipHash = await hashCaller(callerKey(ip));
  const nowIso = now.toISOString();
  const lockEnd = new Date(now.getTime() + LOCKOUT_S * 1000).toISOString();
  const row = await db
    .prepare(DECIDE)
    .bind(ipHash, sent, nowIso, lockEnd)
    .first<{ failures: number; lockedUntil: string | null; hit: number | null }>();
  if (row === null) throw new Error("sync guard: the upsert returned no row");
  if (row.lockedUntil !== null && row.lockedUntil > nowIso) {
    const retryAfterS = Math.max(1, Math.ceil((Date.parse(row.lockedUntil) - now.getTime()) / 1000));
    // Set by this very code, not found in place: the lock is the one this statement would set.
    const lockedNow = row.hit === 0 && row.lockedUntil === lockEnd;
    return { ok: false, status: 429, error: "too many wrong sync codes", retryAfterS, ipHash, lockedNow };
  }
  if (row.hit === null) return { ok: false, status: 503, error: "sync code not set" };
  if (row.hit === 0)
    return { ok: false, status: 403, error: "wrong sync code", attemptsLeft: MAX_FAILURES - row.failures, ipHash };
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
