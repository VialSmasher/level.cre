-- Additive, agent-first broker/account intelligence foundation.
-- Existing prospects, property dossiers, activities, opportunities, and map data
-- are intentionally unchanged by this migration.

CREATE TABLE IF NOT EXISTS public.intel_account_intelligence_batches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source varchar NOT NULL,
  external_batch_id varchar NOT NULL,
  observed_at timestamptz,
  actor_role varchar,
  agent_name varchar,
  status varchar NOT NULL DEFAULT 'processing',
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT chk_intel_account_batch_status
    CHECK (status IN ('processing', 'completed', 'completed_with_review', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_account_batch_identity
  ON public.intel_account_intelligence_batches (user_id, source, external_batch_id);

CREATE INDEX IF NOT EXISTS idx_intel_account_batch_user_created
  ON public.intel_account_intelligence_batches (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.intel_organizations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind varchar NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  source varchar NOT NULL DEFAULT 'manual',
  external_key varchar,
  website_url text,
  website_domain varchar,
  industry varchar,
  parent_organization_id varchar REFERENCES public.intel_organizations(id) ON DELETE SET NULL,
  canadian_presence varchar NOT NULL DEFAULT 'unknown',
  edmonton_northern_alberta_presence varchar NOT NULL DEFAULT 'unknown',
  canadian_pursuit_posture varchar NOT NULL DEFAULT 'unknown',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_intel_organization_kind
    CHECK (kind IN ('corporate_account', 'brokerage_firm', 'other')),
  CONSTRAINT chk_intel_organization_canadian_presence
    CHECK (canadian_presence IN ('confirmed', 'possible', 'none_known', 'unknown')),
  CONSTRAINT chk_intel_organization_edmonton_presence
    CHECK (edmonton_northern_alberta_presence IN ('confirmed', 'possible', 'none_known', 'unknown')),
  CONSTRAINT chk_intel_organization_pursuit_posture
    CHECK (canadian_pursuit_posture IN ('open', 'relationship_route', 'hold', 'blocked_confirmed', 'unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_organization_external
  ON public.intel_organizations (user_id, source, external_key)
  WHERE external_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_organization_name
  ON public.intel_organizations (user_id, kind, normalized_name);

CREATE INDEX IF NOT EXISTS idx_intel_organization_domain
  ON public.intel_organizations (user_id, website_domain)
  WHERE website_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_organization_search
  ON public.intel_organizations
  USING gin (to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(industry, '') || ' ' || COALESCE(notes, '')));

CREATE TABLE IF NOT EXISTS public.intel_organization_aliases (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id varchar NOT NULL REFERENCES public.intel_organizations(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  alias_kind varchar NOT NULL DEFAULT 'common',
  source varchar NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_organization_alias
  ON public.intel_organization_aliases (organization_id, normalized_alias);

CREATE INDEX IF NOT EXISTS idx_intel_organization_alias_lookup
  ON public.intel_organization_aliases (user_id, normalized_alias);

CREATE TABLE IF NOT EXISTS public.intel_people (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  normalized_name text NOT NULL,
  source varchar NOT NULL DEFAULT 'manual',
  external_key varchar,
  verified_business_email varchar,
  phone varchar,
  linkedin_url text,
  biography_url text,
  biography_captured_at timestamptz,
  current_organization_id varchar REFERENCES public.intel_organizations(id) ON DELETE SET NULL,
  title varchar,
  office varchar,
  market varchar,
  specialties varchar[] NOT NULL DEFAULT ARRAY[]::varchar[],
  geographic_focus varchar[] NOT NULL DEFAULT ARRAY[]::varchar[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_person_external
  ON public.intel_people (user_id, source, external_key)
  WHERE external_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_person_verified_email
  ON public.intel_people (user_id, lower(verified_business_email))
  WHERE verified_business_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intel_person_name_firm
  ON public.intel_people (user_id, normalized_name, current_organization_id);

CREATE INDEX IF NOT EXISTS idx_intel_person_search
  ON public.intel_people
  USING gin (to_tsvector('simple', COALESCE(full_name, '') || ' ' || COALESCE(title, '') || ' ' || COALESCE(office, '') || ' ' || COALESCE(market, '')));

CREATE TABLE IF NOT EXISTS public.intel_person_account_relationships (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  person_id varchar NOT NULL REFERENCES public.intel_people(id) ON DELETE CASCADE,
  account_organization_id varchar NOT NULL REFERENCES public.intel_organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_person_account_relationship
  ON public.intel_person_account_relationships (user_id, person_id, account_organization_id);

CREATE INDEX IF NOT EXISTS idx_intel_person_account_account
  ON public.intel_person_account_relationships (user_id, account_organization_id);

CREATE TABLE IF NOT EXISTS public.intel_firm_account_relationships (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  firm_organization_id varchar NOT NULL REFERENCES public.intel_organizations(id) ON DELETE CASCADE,
  account_organization_id varchar NOT NULL REFERENCES public.intel_organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_firm_account_relationship
  ON public.intel_firm_account_relationships (user_id, firm_organization_id, account_organization_id);

CREATE INDEX IF NOT EXISTS idx_intel_firm_account_account
  ON public.intel_firm_account_relationships (user_id, account_organization_id);

CREATE TABLE IF NOT EXISTS public.intel_account_experiences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  person_relationship_id varchar REFERENCES public.intel_person_account_relationships(id) ON DELETE CASCADE,
  firm_relationship_id varchar REFERENCES public.intel_firm_account_relationships(id) ON DELETE CASCADE,
  source varchar NOT NULL,
  external_key varchar NOT NULL,
  classification varchar NOT NULL,
  account_role varchar,
  assignment_scope text,
  asset_classes varchar[] NOT NULL DEFAULT ARRAY['unknown']::varchar[],
  service_line varchar,
  property_type varchar,
  transaction_type varchar,
  transaction_size_sf numeric(16, 2),
  transaction_location text,
  geography text,
  jurisdiction_scope varchar NOT NULL DEFAULT 'unknown',
  relationship_status varchar NOT NULL DEFAULT 'unknown',
  relationship_start_date date,
  relationship_end_date date,
  last_verified_at timestamptz,
  confidence integer NOT NULL DEFAULT 0,
  recommended_use text,
  limitations text,
  outreach_status varchar NOT NULL DEFAULT 'not_started',
  review_status varchar NOT NULL DEFAULT 'observed',
  created_by_actor_role varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_intel_experience_one_relationship
    CHECK ((person_relationship_id IS NOT NULL)::integer + (firm_relationship_id IS NOT NULL)::integer = 1),
  CONSTRAINT chk_intel_experience_confidence
    CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT chk_intel_experience_classification
    CHECK (classification IN (
      'confirmed_current_account_lead',
      'confirmed_current_account_team_member',
      'historical_account_lead',
      'historical_account_team_member',
      'completed_transaction_experience',
      'official_biography_client_disclosure',
      'assignment_disclosure',
      'referral_source_only',
      'client_side_corporate_real_estate_contact',
      'firm_account_relationship',
      'unverified_or_inferred_relationship'
    )),
  CONSTRAINT chk_intel_experience_asset_classes
    CHECK (
      cardinality(asset_classes) BETWEEN 1 AND 10
      AND asset_classes <@ ARRAY[
        'industrial', 'office', 'retail', 'land', 'investment',
        'multifamily', 'hospitality', 'mixed', 'other', 'unknown'
      ]::varchar[]
      AND NOT ('unknown' = ANY(asset_classes) AND cardinality(asset_classes) > 1)
    ),
  CONSTRAINT chk_intel_experience_status
    CHECK (relationship_status IN ('current', 'historical', 'completed', 'unknown')),
  CONSTRAINT chk_intel_experience_scope
    CHECK (jurisdiction_scope IN ('global', 'north_american', 'us', 'canadian', 'regional', 'local', 'unknown')),
  CONSTRAINT chk_intel_experience_review_status
    CHECK (review_status IN ('observed', 'needs_review', 'approved', 'rejected')),
  CONSTRAINT chk_intel_experience_outreach_status
    CHECK (outreach_status IN ('not_started', 'researching', 'outreach_required', 'contacted', 'responded', 'do_not_contact'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_account_experience_external
  ON public.intel_account_experiences (user_id, source, external_key);

CREATE INDEX IF NOT EXISTS idx_intel_account_experience_person
  ON public.intel_account_experiences (person_relationship_id, review_status);

CREATE INDEX IF NOT EXISTS idx_intel_account_experience_firm
  ON public.intel_account_experiences (firm_relationship_id, review_status);

CREATE INDEX IF NOT EXISTS idx_intel_account_experience_status
  ON public.intel_account_experiences (user_id, relationship_status, review_status, last_verified_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_account_experience_assets
  ON public.intel_account_experiences USING gin (asset_classes);

CREATE TABLE IF NOT EXISTS public.intel_relationship_evidence (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  experience_id varchar NOT NULL REFERENCES public.intel_account_experiences(id) ON DELETE CASCADE,
  source varchar NOT NULL,
  external_evidence_id varchar NOT NULL,
  evidence_type varchar NOT NULL,
  evidence_date date,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source_url text,
  outlook_message_id text,
  summary text NOT NULL,
  exact_account_or_assignment text,
  source_reliability varchar NOT NULL DEFAULT 'unknown',
  confidence integer NOT NULL DEFAULT 0,
  stance varchar NOT NULL DEFAULT 'supports',
  contradiction_or_limitation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_intel_relationship_evidence_confidence
    CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT chk_intel_relationship_evidence_type
    CHECK (evidence_type IN (
      'direct_broker_email', 'direct_client_email', 'official_company_biography',
      'official_transaction_announcement', 'listing_or_assignment_brochure',
      'linkedin', 'company_website', 'directory_source',
      'patrick_direct_knowledge', 'internal_referral', 'other'
    )),
  CONSTRAINT chk_intel_relationship_evidence_reliability
    CHECK (source_reliability IN ('high', 'medium', 'low', 'unknown')),
  CONSTRAINT chk_intel_relationship_evidence_stance
    CHECK (stance IN ('supports', 'contradicts', 'limits'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_relationship_evidence_external
  ON public.intel_relationship_evidence (user_id, source, external_evidence_id);

CREATE INDEX IF NOT EXISTS idx_intel_relationship_evidence_experience
  ON public.intel_relationship_evidence (experience_id, evidence_date DESC, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_relationship_evidence_search
  ON public.intel_relationship_evidence
  USING gin (to_tsvector('simple', COALESCE(summary, '') || ' ' || COALESCE(exact_account_or_assignment, '')));

CREATE TABLE IF NOT EXISTS public.intel_account_intelligence_review_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  batch_id varchar REFERENCES public.intel_account_intelligence_batches(id) ON DELETE SET NULL,
  experience_id varchar REFERENCES public.intel_account_experiences(id) ON DELETE CASCADE,
  source varchar NOT NULL,
  external_key varchar NOT NULL,
  entity_type varchar NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar NOT NULL DEFAULT 'pending',
  resolution_note text,
  reviewed_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_intel_account_review_status
    CHECK (status IN ('pending', 'approved', 'rejected', 'superseded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intel_account_review_identity
  ON public.intel_account_intelligence_review_items (user_id, source, external_key)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_intel_account_review_queue
  ON public.intel_account_intelligence_review_items (user_id, status, created_at DESC);

ALTER TABLE public.intel_account_intelligence_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_organization_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_person_account_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_firm_account_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_account_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_relationship_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intel_account_intelligence_review_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.intel_account_intelligence_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_organizations FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_organization_aliases FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_people FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_person_account_relationships FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_firm_account_relationships FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_account_experiences FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_relationship_evidence FROM PUBLIC;
REVOKE ALL ON TABLE public.intel_account_intelligence_review_items FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.intel_account_intelligence_batches, public.intel_organizations, public.intel_organization_aliases, public.intel_people, public.intel_person_account_relationships, public.intel_firm_account_relationships, public.intel_account_experiences, public.intel_relationship_evidence, public.intel_account_intelligence_review_items FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.intel_account_intelligence_batches, public.intel_organizations, public.intel_organization_aliases, public.intel_people, public.intel_person_account_relationships, public.intel_firm_account_relationships, public.intel_account_experiences, public.intel_relationship_evidence, public.intel_account_intelligence_review_items FROM authenticated';
  END IF;
END $$;
