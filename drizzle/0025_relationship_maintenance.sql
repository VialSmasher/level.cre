CREATE TABLE IF NOT EXISTS public.directory_changes (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  request jsonb NOT NULL,
  before_record jsonb,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,external_key)
);
CREATE INDEX IF NOT EXISTS directory_changes_owner_date ON public.directory_changes(user_id,created_at DESC);
ALTER TABLE public.directory_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.directory_changes FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON public.directory_changes FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON public.directory_changes FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT SELECT,INSERT ON public.directory_changes TO service_role; END IF;
END $$;
