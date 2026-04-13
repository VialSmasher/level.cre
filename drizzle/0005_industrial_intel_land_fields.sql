ALTER TABLE public.intel_listings
  ADD COLUMN IF NOT EXISTS asset_type varchar NOT NULL DEFAULT 'building',
  ADD COLUMN IF NOT EXISTS land_acres numeric(12, 2),
  ADD COLUMN IF NOT EXISTS total_price numeric(14, 2),
  ADD COLUMN IF NOT EXISTS price_per_acre numeric(14, 2);

CREATE INDEX IF NOT EXISTS "IDX_intel_listings_asset_type"
  ON public.intel_listings (asset_type);
