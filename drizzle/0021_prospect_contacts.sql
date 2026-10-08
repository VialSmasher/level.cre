-- Private contact-at-record relationships, not a second global people directory.
-- Legacy primary fields remain authoritative. The server versions their snapshots
-- under the owned prospect row lock; no trigger changes existing ingestion/editors.
CREATE TABLE IF NOT EXISTS public.prospect_contacts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  prospect_id varchar NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  source varchar NOT NULL CHECK (source IN ('legacy_primary','broker_added')),
  is_primary boolean NOT NULL DEFAULT false,
  identity_key text,
  name varchar, company varchar, email varchar, phone varchar, title varchar,
  additional_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_contacts_primary_source CHECK (NOT is_primary OR (source='legacy_primary' AND archived_at IS NULL)),
  CONSTRAINT prospect_contacts_phone_options CHECK (jsonb_typeof(additional_phones)='array' AND jsonb_array_length(additional_phones)<=5)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospect_contacts_primary
  ON public.prospect_contacts (user_id,prospect_id) WHERE is_primary AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prospect_contacts_owner_record
  ON public.prospect_contacts (user_id,prospect_id,archived_at);
CREATE INDEX IF NOT EXISTS idx_interactions_contact_attribution
  ON public.contact_interactions (user_id,prospect_id,(source_metadata->>'contactId'))
  WHERE source_metadata->>'contactId' IS NOT NULL;

-- Primary anchors are reconciled lazily by the API. This avoids treating existing
-- unattributed history as this person's history or assigning an unverified person.
ALTER TABLE public.prospect_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prospect_contacts FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.prospect_contacts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.prospect_contacts FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.prospect_contacts TO service_role;
  END IF;
END $$;
-- Deliberately no browser policies. Private API operations authorize the owner
-- explicitly; a future Data API path requires a separately reviewed policy.
