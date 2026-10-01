-- An index review against production's own figures (`wrangler d1 insights`, 7 days, 2026-10-01)
-- and EXPLAIN QUERY PLAN for every query the Worker sends, against the whole index set.
--
-- sgcHealth's rate-limit lookup was production's top query by rows read: ~1,400 a call, which is
-- every run ever recorded, on every tick and every POST /api/refresh. 0003's partial index was
-- there but unused. The query also says `finished_at IS NOT NULL` and orders by `id DESC`, and
-- ingest_runs_finished (0005) matches both, so the planner walked that one from the newest run
-- and checked http_status on each row. While SGC has never sent a 429 or 503, nothing matches and
-- the walk reaches the oldest run. Making the partial index cover the same predicate and order
-- leaves it the only one that can answer, and normally it holds no rows at all.
DROP INDEX ingest_runs_rate_limited;
CREATE INDEX ingest_runs_rate_limited ON ingest_runs(id DESC)
  WHERE http_status IN (429, 503) AND finished_at IS NOT NULL;

-- 0001's index for "the last good run". Since 0005 and 0006 no query's plan uses it, and it was
-- the one that pulled the planner off the right index in 0005. Every plan is unchanged without it.
DROP INDEX ingest_runs_ok;
