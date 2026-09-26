-- Open-Meteo's marine forecast for the 3D block's Pacific (worker/sea.ts, docs/ingest.md "The daily
-- sea-state job"). One row, replaced by the daily job; the file itself is never stored, only its
-- digest: three wave trains an hour for 72 hours.
CREATE TABLE sea_forecast (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source_url TEXT NOT NULL,
  -- When the daily job stored it, ISO 8601.
  fetched_at TEXT NOT NULL,
  -- JSON: [{ t, swell, swell2, wind }], each train { heightM, fromDeg, periodS } or null.
  digest TEXT NOT NULL,
  -- SEA_DIGEST_VERSION in worker/sea.ts when the digest was made; a row from older code is not served.
  digest_version INTEGER NOT NULL
);
