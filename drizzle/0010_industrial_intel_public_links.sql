CREATE TABLE IF NOT EXISTS public.intel_listing_public_link_candidates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id varchar NOT NULL REFERENCES public.intel_listings(id) ON DELETE CASCADE,
  candidate_url text NOT NULL,
  domain varchar NOT NULL,
  title text,
  snippet text,
  confidence integer NOT NULL DEFAULT 0,
  status varchar NOT NULL DEFAULT 'pending',
  source varchar NOT NULL DEFAULT 'resolver',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT chk_intel_public_link_candidate_status
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT chk_intel_public_link_candidate_source
    CHECK (source IN ('resolver', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_public_link_candidate_url
  ON public.intel_listing_public_link_candidates (listing_id, candidate_url);

CREATE INDEX IF NOT EXISTS idx_intel_public_link_candidates_listing
  ON public.intel_listing_public_link_candidates (listing_id);

CREATE INDEX IF NOT EXISTS idx_intel_public_link_candidates_status
  ON public.intel_listing_public_link_candidates (status);
