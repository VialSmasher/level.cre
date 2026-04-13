ALTER TABLE public.intel_listings
  ADD COLUMN IF NOT EXISTS normalized_address text,
  ADD COLUMN IF NOT EXISTS geocode_status varchar NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocode_confidence numeric(5, 2),
  ADD COLUMN IF NOT EXISTS geocode_source varchar,
  ADD COLUMN IF NOT EXISTS data_quality_status varchar NOT NULL DEFAULT 'review';

UPDATE public.intel_listings
SET
  normalized_address = COALESCE(normalized_address, address),
  geocode_status = CASE
    WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 'success'
    WHEN COALESCE(NULLIF(trim(address), ''), NULL) IS NOT NULL THEN 'pending'
    ELSE 'blocked'
  END,
  geocode_confidence = CASE
    WHEN lat IS NOT NULL AND lng IS NOT NULL AND geocode_confidence IS NULL THEN 0.90
    ELSE geocode_confidence
  END,
  geocode_source = CASE
    WHEN lat IS NOT NULL AND lng IS NOT NULL AND geocode_source IS NULL THEN 'source_feed'
    ELSE geocode_source
  END,
  data_quality_status = CASE
    WHEN COALESCE(NULLIF(trim(address), ''), NULL) IS NULL THEN 'review'
    ELSE 'clean'
  END;

CREATE INDEX IF NOT EXISTS idx_intel_listings_geocode_status
  ON public.intel_listings (geocode_status);

CREATE INDEX IF NOT EXISTS idx_intel_listings_data_quality_status
  ON public.intel_listings (data_quality_status);
