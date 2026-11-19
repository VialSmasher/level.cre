ALTER TABLE public.prospect_contacts ADD COLUMN IF NOT EXISTS directory_context jsonb;
CREATE TABLE IF NOT EXISTS public.directory_findings (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  prospect_id varchar NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'observed' CHECK(status IN ('observed','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(user_id,external_key)
);
CREATE INDEX IF NOT EXISTS directory_findings_owner_company ON public.directory_findings(user_id,prospect_id,status);
ALTER TABLE public.directory_findings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.directory_findings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.directory_findings FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.directory_findings FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON public.directory_findings TO service_role; END IF;
END $$;
