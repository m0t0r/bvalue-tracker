-- USGS's products for each zone's mainshock, cut down to what the insights page shows
-- (worker/external.ts, docs/ingest.md "The daily USGS job"). One row per zone and kind, replaced
-- whenever USGS publishes a new version; the file itself is never stored, only its digest.
--
-- `sgc_event_id` is the SGC mainshock the row was matched from. The page shows a digest only while
-- that is still the zone's detected mainshock, so a later, larger event never inherits the M7.4's
-- felt reports or forecast (docs/api.md).
CREATE TABLE external_products (
  zone TEXT NOT NULL,
  -- 'dyfi' | 'pager' | 'forecast'
  kind TEXT NOT NULL,
  -- Only 'usgs' so far; EMSC would be a second source for the same kind.
  source TEXT NOT NULL,
  sgc_event_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  -- The product file's URL. USGS versions its product URLs, so an unchanged URL is an unchanged file.
  product_url TEXT NOT NULL,
  -- When USGS last updated the product (its `updateTime`), ISO 8601.
  source_updated_at TEXT NOT NULL,
  -- When the daily job last confirmed this was USGS's current version.
  checked_at TEXT NOT NULL,
  digest TEXT NOT NULL,
  -- DIGEST_VERSION in worker/usgs.ts when the digest was made. A row from older digest code is
  -- rebuilt on the next run although USGS's URL has not changed; a final product such as PAGER's
  -- would otherwise keep the old shape for good.
  digest_version INTEGER NOT NULL,
  PRIMARY KEY (zone, kind)
);
