-- What SGC answered when a run failed. Kept as columns, not parsed out of `error`,
-- because the back-off in scheduled() has to key off 429/503 and a reworded message
-- must never quietly turn the back-off off.
ALTER TABLE ingest_runs ADD COLUMN http_status INTEGER;
ALTER TABLE ingest_runs ADD COLUMN retry_after_s INTEGER;
