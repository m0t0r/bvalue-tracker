-- ingest_runs is now written ~312 times a day instead of ~120, and three hot queries
-- scanned the whole table on every tick. Unindexed, that crosses D1's free 5M rows/day
-- at roughly three months and keeps climbing. All three are index-backed now.

-- fastLaneBlocked's rate-limit lookup, on every fast tick (192/day). Partial, so it holds
-- only the runs SGC actually refused — normally none at all, which is the whole point:
-- the common case reads an empty index instead of every run ever recorded.
CREATE INDEX ingest_runs_rate_limited ON ingest_runs(id) WHERE http_status IN (429, 503);

-- backfillProgress (every wide tick and every POST /api/refresh) and ingestSweep's
-- least-recently-attempted ordering. Column order matters: this makes both covering
-- index searches over the sweep rows alone, which grow 24/day, not 312.
CREATE INDEX ingest_runs_sweep ON ingest_runs(trigger, window_start, ok, started_at);
