-- The code that guards "Sincronizar ahora" (POST /api/refresh), and the per-IP lockout that makes a
-- 4-digit code worth having (worker/sync-guard.ts, docs/security.md "The sync code").
--
-- The code is never in this file, a test, a doc or a commit: the repo is public. The owner sets it
-- with one command (docs/deployment.md, "The sync code"). Until that row exists every sync is
-- refused with a 503: the guard fails closed.
CREATE TABLE sync_code (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  code TEXT NOT NULL CHECK (length(code) = 4 AND code NOT GLOB '*[^0-9]*'),
  -- The code before the last change, set by the trigger below. A page still holding it is asked for
  -- the new one and not counted: every open tab would otherwise spend one of its network's three tries.
  previous_code TEXT,
  -- When the owner last set it, ISO 8601 or SQLite's datetime('now').
  updated_at TEXT NOT NULL
);

-- The owner's command (docs/deployment.md) stays one upsert of `code`; this keeps the one it replaced.
CREATE TRIGGER sync_code_keeps_previous AFTER UPDATE OF code ON sync_code
WHEN old.code <> new.code
BEGIN
  UPDATE sync_code SET previous_code = old.code WHERE id = new.id;
END;

-- One row per caller that has sent a code: wrong codes in a row, and the lock they earn.
CREATE TABLE sync_lockouts (
  -- SHA-256 of the caller's address (its /48 for IPv6), hex, first 32 characters. Never the address.
  ip_hash TEXT PRIMARY KEY,
  -- Wrong codes in a row. Back to 0 on a right code, and when a lock is set, so the next three count afresh.
  failures INTEGER NOT NULL DEFAULT 0,
  -- ISO 8601. While it is in the future, every code from this caller is refused, the right one too.
  locked_until TEXT,
  -- A random id of the request whose wrong code set the lock, so that request alone logs it, however
  -- many arrive in the same millisecond.
  locked_by TEXT,
  -- ISO 8601, the last code this caller sent; rows untouched for a day are purged.
  updated_at TEXT NOT NULL
);
