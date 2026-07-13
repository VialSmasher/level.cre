CREATE TABLE IF NOT EXISTS public.opportunities (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  title varchar NOT NULL,
  stage varchar NOT NULL DEFAULT 'target',
  status varchar NOT NULL DEFAULT 'active',
  company varchar,
  contact_name varchar,
  contact_email varchar,
  property_address text,
  prospect_id varchar REFERENCES public.prospects(id) ON DELETE SET NULL,
  listing_id varchar REFERENCES public.listings(id) ON DELETE SET NULL,
  estimated_fee numeric(14, 2),
  probability_percent integer,
  ownership_share_percent numeric(5, 2),
  expected_close_date timestamp,
  confidence integer NOT NULL DEFAULT 0,
  source varchar NOT NULL DEFAULT 'manual',
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  archived_at timestamp,
  CONSTRAINT opportunities_probability_range CHECK (probability_percent IS NULL OR probability_percent BETWEEN 0 AND 100),
  CONSTRAINT opportunities_confidence_range CHECK (confidence BETWEEN 0 AND 100),
  CONSTRAINT opportunities_share_range CHECK (ownership_share_percent IS NULL OR ownership_share_percent BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS "IDX_opportunities_user_status" ON public.opportunities(user_id, status);
CREATE INDEX IF NOT EXISTS "IDX_opportunities_user_stage" ON public.opportunities(user_id, stage);
CREATE INDEX IF NOT EXISTS "IDX_opportunities_prospect" ON public.opportunities(prospect_id);
CREATE INDEX IF NOT EXISTS "IDX_opportunities_listing" ON public.opportunities(listing_id);

CREATE TABLE IF NOT EXISTS public.activity_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source varchar NOT NULL,
  external_event_id varchar NOT NULL,
  event_type varchar NOT NULL,
  direction varchar,
  evidence_status varchar NOT NULL DEFAULT 'observed',
  occurred_at timestamp NOT NULL,
  recorded_at timestamp DEFAULT now(),
  contact_name varchar,
  company varchar,
  email varchar,
  phone varchar,
  subject text,
  summary text,
  property_address text,
  confidence integer NOT NULL DEFAULT 0,
  match_status varchar NOT NULL DEFAULT 'unassigned',
  match_reason text,
  prospect_id varchar REFERENCES public.prospects(id) ON DELETE SET NULL,
  listing_id varchar REFERENCES public.listings(id) ON DELETE SET NULL,
  opportunity_id varchar REFERENCES public.opportunities(id) ON DELETE SET NULL,
  interaction_id varchar REFERENCES public.contact_interactions(id) ON DELETE SET NULL,
  evidence_url text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT activity_events_confidence_range CHECK (confidence BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_activity_events_external"
  ON public.activity_events(user_id, source, external_event_id);
CREATE INDEX IF NOT EXISTS "IDX_activity_events_user_occurred" ON public.activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS "IDX_activity_events_user_type" ON public.activity_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS "IDX_activity_events_user_match" ON public.activity_events(user_id, match_status);
CREATE INDEX IF NOT EXISTS "IDX_activity_events_prospect" ON public.activity_events(prospect_id);
CREATE INDEX IF NOT EXISTS "IDX_activity_events_opportunity" ON public.activity_events(opportunity_id);

CREATE TABLE IF NOT EXISTS public.activity_event_links (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id varchar NOT NULL REFERENCES public.activity_events(id) ON DELETE CASCADE,
  entity_type varchar NOT NULL,
  entity_id varchar NOT NULL,
  role varchar NOT NULL DEFAULT 'related',
  confidence integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  CONSTRAINT activity_event_links_confidence_range CHECK (confidence BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_activity_event_link"
  ON public.activity_event_links(event_id, entity_type, entity_id, role);
CREATE INDEX IF NOT EXISTS "IDX_activity_event_links_entity"
  ON public.activity_event_links(user_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.opportunity_stage_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  opportunity_id varchar NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  from_stage varchar,
  to_stage varchar NOT NULL,
  changed_at timestamp NOT NULL DEFAULT now(),
  evidence_status varchar NOT NULL DEFAULT 'confirmed',
  confidence integer NOT NULL DEFAULT 100,
  source varchar NOT NULL DEFAULT 'manual',
  source_event_id varchar REFERENCES public.activity_events(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  CONSTRAINT opportunity_stage_events_confidence_range CHECK (confidence BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS "IDX_opportunity_stage_events_opportunity"
  ON public.opportunity_stage_events(opportunity_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS public.opportunity_playbook_steps (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  opportunity_id varchar NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  step_type varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  completed_at timestamp,
  source_event_id varchar REFERENCES public.activity_events(id) ON DELETE SET NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_opportunity_playbook_steps_opportunity"
  ON public.opportunity_playbook_steps(opportunity_id, status);
