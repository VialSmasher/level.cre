CREATE TABLE public.desk_sync (
  owner_id text PRIMARY KEY,
  request_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('queued', 'running', 'complete', 'partial', 'failed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  result jsonb
);

ALTER TABLE public.desk_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desk_sync FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.desk_sync FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.desk_sync FROM authenticated;
  END IF;
END $$;
