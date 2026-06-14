CREATE TABLE IF NOT EXISTS public.intel_property_dossiers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_listing_id varchar REFERENCES public.intel_listings(id) ON DELETE SET NULL,
  title varchar NOT NULL,
  address text,
  normalized_address text,
  market varchar,
  submarket varchar,
  asset_type varchar,
  listing_type varchar,
  status varchar NOT NULL DEFAULT 'active',
  lat numeric,
  lng numeric,
  data_completeness_score integer NOT NULL DEFAULT 0,
  created_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT chk_intel_property_dossiers_status
    CHECK (status IN ('active', 'draft', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_property_dossiers_user_listing
  ON public.intel_property_dossiers (created_by_user_id, canonical_listing_id)
  WHERE canonical_listing_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_property_dossiers_user_address
  ON public.intel_property_dossiers (created_by_user_id, normalized_address)
  WHERE normalized_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_user
  ON public.intel_property_dossiers (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_status
  ON public.intel_property_dossiers (status);

ALTER TABLE public.intel_listing_assets
  ADD COLUMN IF NOT EXISTS dossier_id varchar REFERENCES public.intel_property_dossiers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_intel_listing_assets_dossier
  ON public.intel_listing_assets (dossier_id);

CREATE TABLE IF NOT EXISTS public.intel_dossier_facts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id varchar NOT NULL REFERENCES public.intel_property_dossiers(id) ON DELETE CASCADE,
  source_asset_id varchar REFERENCES public.intel_listing_assets(id) ON DELETE SET NULL,
  fact_key varchar NOT NULL,
  label varchar NOT NULL,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_json jsonb,
  confidence integer NOT NULL DEFAULT 50,
  status varchar NOT NULL DEFAULT 'proposed',
  source varchar NOT NULL DEFAULT 'manual',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT chk_intel_dossier_facts_status
    CHECK (status IN ('proposed', 'approved', 'rejected')),
  CONSTRAINT chk_intel_dossier_facts_confidence
    CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE INDEX IF NOT EXISTS idx_intel_dossier_facts_dossier
  ON public.intel_dossier_facts (dossier_id);

CREATE INDEX IF NOT EXISTS idx_intel_dossier_facts_status
  ON public.intel_dossier_facts (status);

ALTER TABLE public.intel_property_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_dossier_facts ENABLE ROW LEVEL SECURITY;
