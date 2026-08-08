CREATE TABLE IF NOT EXISTS public.brokerage_memory_imports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source varchar NOT NULL DEFAULT 'current_projects_title_enrichment',
  source_file_name text,
  source_hash varchar NOT NULL,
  generated_at timestamptz,
  status varchar NOT NULL DEFAULT 'preview',
  identity_count integer NOT NULL DEFAULT 0,
  anchor_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_brokerage_memory_import_status
    CHECK (status IN ('preview', 'partially_approved', 'completed', 'superseded', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brokerage_memory_import_source_hash
  ON public.brokerage_memory_imports (user_id, source, source_hash);

CREATE INDEX IF NOT EXISTS idx_brokerage_memory_import_user_status
  ON public.brokerage_memory_imports (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.brokerage_memory_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  import_id varchar NOT NULL REFERENCES public.brokerage_memory_imports(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  external_anchor_id varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  base_layer varchar NOT NULL,
  suggested_layer varchar NOT NULL,
  address text NOT NULL,
  normalized_address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  matched_dossier_id varchar REFERENCES public.intel_property_dossiers(id) ON DELETE SET NULL,
  matched_prospect_id varchar REFERENCES public.prospects(id) ON DELETE SET NULL,
  matched_listing_id varchar REFERENCES public.listings(id) ON DELETE SET NULL,
  match_confidence integer NOT NULL DEFAULT 0,
  resolution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  anchor_payload jsonb NOT NULL,
  decision_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_action varchar,
  decided_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_brokerage_memory_item_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  CONSTRAINT chk_brokerage_memory_item_base_layer
    CHECK (base_layer IN ('market_memory', 'review')),
  CONSTRAINT chk_brokerage_memory_item_suggested_layer
    CHECK (suggested_layer IN ('existing', 'market_memory', 'review')),
  CONSTRAINT chk_brokerage_memory_item_confidence
    CHECK (match_confidence BETWEEN 0 AND 100),
  CONSTRAINT chk_brokerage_memory_item_decision_action
    CHECK (decision_action IS NULL OR decision_action IN ('create_dossier', 'link_dossier', 'reject'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brokerage_memory_item_anchor
  ON public.brokerage_memory_items (import_id, external_anchor_id);

CREATE INDEX IF NOT EXISTS idx_brokerage_memory_item_user_status
  ON public.brokerage_memory_items (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_brokerage_memory_item_location
  ON public.brokerage_memory_items (lat, lng);

CREATE INDEX IF NOT EXISTS idx_brokerage_memory_item_dossier
  ON public.brokerage_memory_items (matched_dossier_id)
  WHERE matched_dossier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_memory_item_prospect
  ON public.brokerage_memory_items (matched_prospect_id)
  WHERE matched_prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_memory_item_listing
  ON public.brokerage_memory_items (matched_listing_id)
  WHERE matched_listing_id IS NOT NULL;

ALTER TABLE public.intel_property_dossiers
  ADD COLUMN IF NOT EXISTS prospect_id varchar REFERENCES public.prospects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_memory_key varchar,
  ADD COLUMN IF NOT EXISTS memory_class varchar NOT NULL DEFAULT 'inventory',
  ADD COLUMN IF NOT EXISTS memory_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS origin_import_item_id varchar REFERENCES public.brokerage_memory_items(id) ON DELETE SET NULL;

ALTER TABLE public.intel_property_dossiers
  ALTER COLUMN memory_class SET DEFAULT 'inventory';

DROP INDEX IF EXISTS public.uq_intel_property_dossiers_user_address;

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_user_address
  ON public.intel_property_dossiers (created_by_user_id, normalized_address)
  WHERE normalized_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_property_dossiers_user_prospect
  ON public.intel_property_dossiers (created_by_user_id, prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_prospect
  ON public.intel_property_dossiers (prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_property_dossiers_user_memory_key
  ON public.intel_property_dossiers (created_by_user_id, external_memory_key)
  WHERE external_memory_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_memory_class
  ON public.intel_property_dossiers (created_by_user_id, memory_class, status);

CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_origin_import_item
  ON public.intel_property_dossiers (origin_import_item_id)
  WHERE origin_import_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.intel_dossier_entity_links (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dossier_id varchar NOT NULL REFERENCES public.intel_property_dossiers(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  entity_type varchar NOT NULL,
  entity_id varchar NOT NULL,
  relationship varchar NOT NULL DEFAULT 'related',
  source varchar NOT NULL DEFAULT 'manual',
  import_item_id varchar REFERENCES public.brokerage_memory_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_intel_dossier_entity_link_type
    CHECK (entity_type IN ('prospect', 'listing', 'company', 'contact', 'opportunity'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_dossier_entity_link
  ON public.intel_dossier_entity_links (dossier_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_intel_dossier_entity_link_entity
  ON public.intel_dossier_entity_links (user_id, entity_type, entity_id);

ALTER TABLE public.intel_dossier_facts
  ADD COLUMN IF NOT EXISTS external_fact_id varchar,
  ADD COLUMN IF NOT EXISTS import_item_id varchar REFERENCES public.brokerage_memory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_dossier_facts_external
  ON public.intel_dossier_facts (dossier_id, external_fact_id)
  WHERE external_fact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_dossier_facts_import_item
  ON public.intel_dossier_facts (import_item_id)
  WHERE import_item_id IS NOT NULL;

ALTER TABLE public.brokerage_memory_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brokerage_memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_dossier_entity_links ENABLE ROW LEVEL SECURITY;
