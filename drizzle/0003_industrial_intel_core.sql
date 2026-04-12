CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.intel_sources (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  slug varchar NOT NULL,
  kind varchar NOT NULL DEFAULT 'manual_upload',
  feed_url text,
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id varchar REFERENCES public.users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_sources_slug
  ON public.intel_sources (slug);

CREATE INDEX IF NOT EXISTS idx_intel_sources_active
  ON public.intel_sources (is_active);

CREATE TABLE IF NOT EXISTS public.intel_listings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id varchar NOT NULL REFERENCES public.intel_sources(id) ON DELETE CASCADE,
  source_record_key varchar NOT NULL,
  external_id varchar,
  status varchar NOT NULL DEFAULT 'active',
  listing_type varchar NOT NULL DEFAULT 'lease',
  title varchar NOT NULL,
  address text,
  market varchar,
  submarket varchar,
  lat numeric(9, 6),
  lng numeric(9, 6),
  available_sf integer,
  min_divisible_sf integer,
  clear_height_ft numeric(6, 2),
  brochure_url text,
  source_url text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash varchar NOT NULL,
  first_seen_at timestamp DEFAULT now(),
  last_seen_at timestamp DEFAULT now(),
  removed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_listings_source_record
  ON public.intel_listings (source_id, source_record_key);

CREATE INDEX IF NOT EXISTS idx_intel_listings_source
  ON public.intel_listings (source_id);

CREATE INDEX IF NOT EXISTS idx_intel_listings_status
  ON public.intel_listings (status);

CREATE INDEX IF NOT EXISTS idx_intel_listings_submarket
  ON public.intel_listings (submarket);

CREATE INDEX IF NOT EXISTS idx_intel_listings_last_seen
  ON public.intel_listings (last_seen_at);

CREATE TABLE IF NOT EXISTS public.intel_ingest_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id varchar REFERENCES public.intel_sources(id) ON DELETE SET NULL,
  trigger_type varchar NOT NULL DEFAULT 'manual',
  status varchar NOT NULL DEFAULT 'completed',
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  records_seen integer NOT NULL DEFAULT 0,
  records_new integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_removed integer NOT NULL DEFAULT 0,
  error_message text,
  initiated_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_intel_runs_source
  ON public.intel_ingest_runs (source_id);

CREATE INDEX IF NOT EXISTS idx_intel_runs_started_at
  ON public.intel_ingest_runs (started_at);

CREATE TABLE IF NOT EXISTS public.intel_listing_changes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id varchar NOT NULL REFERENCES public.intel_listings(id) ON DELETE CASCADE,
  ingest_run_id varchar REFERENCES public.intel_ingest_runs(id) ON DELETE SET NULL,
  change_type varchar NOT NULL,
  change_summary text,
  previous_hash varchar,
  new_hash varchar,
  observed_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intel_listing_changes_listing
  ON public.intel_listing_changes (listing_id);

CREATE INDEX IF NOT EXISTS idx_intel_listing_changes_observed_at
  ON public.intel_listing_changes (observed_at);
