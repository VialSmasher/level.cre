ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS address varchar,
  ADD COLUMN IF NOT EXISTS location_lat double precision,
  ADD COLUMN IF NOT EXISTS location_lng double precision,
  ADD COLUMN IF NOT EXISTS geohash varchar,
  ADD COLUMN IF NOT EXISTS market_key varchar,
  ADD COLUMN IF NOT EXISTS market_confidence integer,
  ADD COLUMN IF NOT EXISTS market_context_source varchar,
  ADD COLUMN IF NOT EXISTS market_context_status varchar DEFAULT 'unknown';

UPDATE public.prospects
SET
  location_lat = COALESCE(location_lat, ST_Y(geometry)),
  location_lng = COALESCE(location_lng, ST_X(geometry))
WHERE GeometryType(geometry) = 'POINT'
  AND (location_lat IS NULL OR location_lng IS NULL);

CREATE INDEX IF NOT EXISTS idx_prospects_user_market_key
  ON public.prospects (user_id, market_key)
  WHERE market_key IS NOT NULL;

ALTER TABLE public.prospects
  DROP CONSTRAINT IF EXISTS prospects_market_confidence_range;

ALTER TABLE public.prospects
  ADD CONSTRAINT prospects_market_confidence_range
  CHECK (market_confidence IS NULL OR market_confidence BETWEEN 0 AND 100);
