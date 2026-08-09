ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS merged_into_prospect_id varchar,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_by_user_id varchar,
  ADD COLUMN IF NOT EXISTS merge_event_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_prospects_merged_into'
  ) THEN
    ALTER TABLE public.prospects
      ADD CONSTRAINT fk_prospects_merged_into
      FOREIGN KEY (merged_into_prospect_id)
      REFERENCES public.prospects(id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_prospects_merged_by_user'
  ) THEN
    ALTER TABLE public.prospects
      ADD CONSTRAINT fk_prospects_merged_by_user
      FOREIGN KEY (merged_by_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_prospects_not_self_merged'
  ) THEN
    ALTER TABLE public.prospects
      ADD CONSTRAINT chk_prospects_not_self_merged
      CHECK (merged_into_prospect_id IS NULL OR merged_into_prospect_id <> id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_prospects_merge_state_complete'
  ) THEN
    ALTER TABLE public.prospects
      ADD CONSTRAINT chk_prospects_merge_state_complete
      CHECK (
        (merged_into_prospect_id IS NULL AND merged_at IS NULL AND merge_event_id IS NULL)
        OR
        (merged_into_prospect_id IS NOT NULL AND merged_at IS NOT NULL AND merge_event_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.prospect_merge_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  canonical_prospect_id varchar NOT NULL REFERENCES public.prospects(id) ON DELETE RESTRICT,
  duplicate_prospect_ids varchar[] NOT NULL,
  preview_hash varchar NOT NULL,
  idempotency_key varchar NOT NULL,
  field_choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_snapshot jsonb NOT NULL,
  relationship_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb,
  moved_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reversed_at timestamptz,
  reversed_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT chk_prospect_merge_event_status
    CHECK (status IN ('completed', 'reversed')),
  CONSTRAINT chk_prospect_merge_event_duplicates
    CHECK (cardinality(duplicate_prospect_ids) BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_merge_events_idempotency
  ON public.prospect_merge_events (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_prospect_merge_events_user_created
  ON public.prospect_merge_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_merge_events_canonical
  ON public.prospect_merge_events (canonical_prospect_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_prospects_merge_event'
  ) THEN
    ALTER TABLE public.prospects
      ADD CONSTRAINT fk_prospects_merge_event
      FOREIGN KEY (merge_event_id)
      REFERENCES public.prospect_merge_events(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prospects_active_user_updated
  ON public.prospects (user_id, updated_at DESC)
  WHERE merged_into_prospect_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_merged_into
  ON public.prospects (merged_into_prospect_id)
  WHERE merged_into_prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_interactions_user_prospect_created
  ON public.contact_interactions (user_id, prospect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_prospect_occurred
  ON public.activity_events (user_id, prospect_id, occurred_at DESC)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_activity_imports_user_prospect_activity
  ON public.sales_activity_imports (user_id, prospect_id, activity_at DESC)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_touches_user_prospect_created
  ON public.touches (user_id, prospect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_listing_occurred
  ON public.activity_events (listing_id, occurred_at DESC)
  WHERE listing_id IS NOT NULL
    AND match_status = 'matched'
    AND evidence_status IN ('observed', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_activity_events_opportunity_occurred
  ON public.activity_events (opportunity_id, occurred_at DESC)
  WHERE opportunity_id IS NOT NULL
    AND match_status = 'matched'
    AND evidence_status IN ('observed', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_prospects_user_status_submarket
  ON public.prospects (user_id, status, submarket_id)
  WHERE merged_into_prospect_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_intel_dossier_facts_approved_key_observed
  ON public.intel_dossier_facts (dossier_id, fact_key, observed_at DESC)
  INCLUDE (value_text)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_intel_dossier_facts_approved_search
  ON public.intel_dossier_facts
  USING gin (to_tsvector('simple', COALESCE(value_text, '')))
  WHERE status = 'approved' AND value_text IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_search
  ON public.intel_property_dossiers
  USING gin (to_tsvector(
    'simple',
    COALESCE(title, '') || ' ' || COALESCE(address, '') || ' ' ||
    COALESCE(market, '') || ' ' || COALESCE(submarket, '')
  ))
  WHERE status <> 'archived' AND approved_at IS NOT NULL;

ALTER TABLE public.prospect_merge_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prospect_merge_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.prospect_merge_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.prospect_merge_events FROM authenticated';
  END IF;
END $$;
