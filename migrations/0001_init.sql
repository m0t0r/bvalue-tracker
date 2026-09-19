CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  time            TEXT NOT NULL,
  lat             REAL NOT NULL,
  lon             REAL NOT NULL,
  depth_km        REAL NOT NULL,
  mag             REAL NOT NULL,
  mag_type        TEXT NOT NULL,
  phases          INTEGER,
  rms_s           REAL,
  gap_deg         REAL,
  err_lat_km      REAL,
  err_lon_km      REAL,
  err_depth_km    REAL,
  region          TEXT NOT NULL,
  status          TEXT NOT NULL,
  solution_stamp  TEXT,
  first_seen_at   TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  removed_at      TEXT
);
CREATE INDEX events_time ON events(time);

CREATE TABLE ingest_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  trigger       TEXT NOT NULL,
  window_start  TEXT NOT NULL,
  window_end    TEXT NOT NULL,
  ok            INTEGER NOT NULL DEFAULT 0,
  fetched       INTEGER,
  inserted      INTEGER,
  updated       INTEGER,
  removed       INTEGER,
  error         TEXT
);
CREATE INDEX ingest_runs_ok ON ingest_runs(ok, finished_at);
