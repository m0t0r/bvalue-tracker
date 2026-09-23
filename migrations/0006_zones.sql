-- A second place to follow: the Chaparral (Tolima) swarm, beside the Chocó sequence
-- (core/zones.ts). Every event and every run now belongs to one zone. Everything recorded
-- before this migration is Chocó's, which is what the default says.
ALTER TABLE events ADD COLUMN zone TEXT NOT NULL DEFAULT 'choco';
ALTER TABLE ingest_runs ADD COLUMN zone TEXT NOT NULL DEFAULT 'choco';

-- Every read of `events` by time is now a read of one zone by time: the page's catalogue,
-- /api/status's newest event, and ingest's own window. events_time would still serve them,
-- by reading the other zone's rows and discarding them.
DROP INDEX events_time;
CREATE INDEX events_zone_time ON events(zone, time);

-- The sweep's two queries (backfillProgress, and ingestSweep's least-recently-attempted
-- order) are per zone now. Chunk starts are not unique across zones — Chaparral's chunks are
-- single days, so every Chocó chunk start from 2026-09-21 on is one of them too — so `zone` has
-- to be in the key. It leads, so each zone's sweep rows are one contiguous range, as 0003 made
-- them when there was one zone.
DROP INDEX ingest_runs_sweep;
CREATE INDEX ingest_runs_sweep ON ingest_runs(zone, trigger, window_start, ok, started_at);

-- `lastRun` per zone: what /api/status answers, on every poll from every open page, and what
-- /api/health answers per zone. 0005's ingest_runs_finished stays, for the questions that are
-- about SGC rather than about a zone (the health rule's last twelve runs, the newest run of any
-- zone). Its ingest_runs_finished_ok goes: it answered "the last successful run of any zone",
-- which nothing asks any more.
-- Both new ones lead with `zone` and end with `id DESC`, so each query is one seek and the
-- first entry, whatever the other zone has been doing; checked with EXPLAIN QUERY PLAN against
-- the whole index set, as 0005 says (worker/test/ingest.test.ts holds it).
DROP INDEX ingest_runs_finished_ok;
CREATE INDEX ingest_runs_zone_finished ON ingest_runs(zone, id DESC) WHERE finished_at IS NOT NULL;
CREATE INDEX ingest_runs_zone_finished_ok ON ingest_runs(zone, ok, id DESC) WHERE finished_at IS NOT NULL;
