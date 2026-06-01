CREATE TABLE IF NOT EXISTS public.intel_listing_assets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id varchar REFERENCES public.intel_listings(id) ON DELETE CASCADE,
  survey_id varchar REFERENCES public.intel_surveys(id) ON DELETE CASCADE,
  survey_item_id varchar REFERENCES public.intel_survey_items(id) ON DELETE CASCADE,
  asset_type varchar NOT NULL DEFAULT 'brochure',
  file_name text NOT NULL,
  content_type varchar NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_bucket varchar NOT NULL,
  storage_path text NOT NULL UNIQUE,
  source varchar NOT NULL DEFAULT 'upload',
  status varchar NOT NULL DEFAULT 'pending',
  is_primary boolean NOT NULL DEFAULT false,
  created_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT chk_intel_listing_assets_type
    CHECK (asset_type IN ('brochure', 'flyer', 'aerial', 'site_plan', 'photo', 'survey_page', 'other')),
  CONSTRAINT chk_intel_listing_assets_source
    CHECK (source IN ('upload', 'email', 'resolver', 'manual')),
  CONSTRAINT chk_intel_listing_assets_status
    CHECK (status IN ('pending', 'active', 'failed', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_intel_listing_assets_listing
  ON public.intel_listing_assets (listing_id);

CREATE INDEX IF NOT EXISTS idx_intel_listing_assets_survey
  ON public.intel_listing_assets (survey_id);

CREATE INDEX IF NOT EXISTS idx_intel_listing_assets_survey_item
  ON public.intel_listing_assets (survey_item_id);

CREATE INDEX IF NOT EXISTS idx_intel_listing_assets_status
  ON public.intel_listing_assets (status);
