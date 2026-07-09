CREATE TABLE IF NOT EXISTS public.sales_activity_imports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source varchar NOT NULL DEFAULT 'codex_followup',
  run_id varchar,
  external_activity_id varchar NOT NULL,
  activity_status varchar NOT NULL,
  activity_type varchar NOT NULL DEFAULT 'email',
  contact_name varchar,
  company varchar,
  email varchar,
  email_domain varchar,
  subject text,
  notes text,
  activity_at timestamp,
  prospect_id varchar REFERENCES public.prospects(id) ON DELETE SET NULL,
  listing_id varchar REFERENCES public.listings(id) ON DELETE SET NULL,
  match_status varchar NOT NULL DEFAULT 'needs_review',
  match_reason text,
  confidence integer NOT NULL DEFAULT 0,
  interaction_id varchar REFERENCES public.contact_interactions(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sales_activity_imports_external"
  ON public.sales_activity_imports(user_id, source, external_activity_id);

CREATE INDEX IF NOT EXISTS "IDX_sales_activity_imports_user_status"
  ON public.sales_activity_imports(user_id, match_status);

CREATE INDEX IF NOT EXISTS "IDX_sales_activity_imports_activity_at"
  ON public.sales_activity_imports(user_id, activity_at);

CREATE INDEX IF NOT EXISTS "IDX_sales_activity_imports_prospect"
  ON public.sales_activity_imports(prospect_id);

CREATE INDEX IF NOT EXISTS "IDX_sales_activity_imports_interaction"
  ON public.sales_activity_imports(interaction_id);
