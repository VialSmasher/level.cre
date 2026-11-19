CREATE TABLE IF NOT EXISTS public.directory_brokers (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  firm text NOT NULL DEFAULT 'Cushman & Wakefield',
  office text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  linkedin_url text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS directory_brokers_owner ON public.directory_brokers(user_id);
CREATE TABLE IF NOT EXISTS public.directory_relationships (
  id uuid PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  broker_id uuid NOT NULL,
  prospect_id varchar NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('unverified','active','historical','ended')),
  scope text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  learned_on date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (broker_id,user_id) REFERENCES public.directory_brokers(id,user_id) ON DELETE CASCADE,
  UNIQUE (user_id,broker_id,prospect_id)
);
CREATE INDEX IF NOT EXISTS directory_relationships_company ON public.directory_relationships(user_id,prospect_id);
ALTER TABLE public.directory_brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.directory_brokers, public.directory_relationships FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.directory_brokers, public.directory_relationships FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.directory_brokers, public.directory_relationships FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.directory_brokers, public.directory_relationships TO service_role;
  END IF;
END $$;
