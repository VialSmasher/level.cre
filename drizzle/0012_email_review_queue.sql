ALTER TABLE public.contact_interactions
  ADD COLUMN IF NOT EXISTS source_provider varchar,
  ADD COLUMN IF NOT EXISTS source_message_id varchar,
  ADD COLUMN IF NOT EXISTS source_thread_id varchar,
  ADD COLUMN IF NOT EXISTS source_email_message_id varchar,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "IDX_interactions_source_message"
  ON public.contact_interactions(user_id, source_provider, source_message_id);

CREATE TABLE IF NOT EXISTS public.email_connections (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider varchar NOT NULL,
  provider_account_id varchar,
  email_address varchar,
  display_name varchar,
  status varchar NOT NULL DEFAULT 'needs_connection',
  scopes varchar[] DEFAULT ARRAY[]::varchar[],
  token_ciphertext text,
  token_expires_at timestamp,
  sync_sent boolean NOT NULL DEFAULT true,
  sync_received boolean NOT NULL DEFAULT true,
  last_synced_at timestamp,
  sync_cursor text,
  error_message text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_email_connections_user"
  ON public.email_connections(user_id);

ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS token_ciphertext text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_email_connections_provider_account"
  ON public.email_connections(user_id, provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connection_id varchar REFERENCES public.email_connections(id) ON DELETE SET NULL,
  provider varchar NOT NULL,
  provider_message_id varchar NOT NULL,
  provider_thread_id varchar,
  mailbox varchar NOT NULL DEFAULT 'unknown',
  direction varchar NOT NULL DEFAULT 'unknown',
  subject text,
  sender_email varchar,
  sender_name varchar,
  recipient_emails varchar[] DEFAULT ARRAY[]::varchar[],
  cc_emails varchar[] DEFAULT ARRAY[]::varchar[],
  sent_at timestamp,
  received_at timestamp,
  snippet text,
  body_text_hash varchar,
  attachment_names varchar[] DEFAULT ARRAY[]::varchar[],
  source_url text,
  raw_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_email_messages_user"
  ON public.email_messages(user_id);

CREATE INDEX IF NOT EXISTS "IDX_email_messages_thread"
  ON public.email_messages(user_id, provider, provider_thread_id);

CREATE INDEX IF NOT EXISTS "IDX_email_messages_sent_at"
  ON public.email_messages(user_id, sent_at);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_email_messages_provider_message"
  ON public.email_messages(user_id, provider, provider_message_id);

CREATE TABLE IF NOT EXISTS public.email_prospect_matches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_message_id varchar NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  prospect_id varchar REFERENCES public.prospects(id) ON DELETE SET NULL,
  listing_id varchar REFERENCES public.listings(id) ON DELETE SET NULL,
  confidence integer NOT NULL DEFAULT 0,
  match_status varchar NOT NULL DEFAULT 'pending_review',
  match_reason text,
  suggested_interaction_type varchar NOT NULL DEFAULT 'email',
  suggested_outcome varchar NOT NULL DEFAULT 'contacted',
  suggested_summary text,
  suggested_next_follow_up timestamp,
  interaction_id varchar REFERENCES public.contact_interactions(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  reviewed_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_email_matches_user_status"
  ON public.email_prospect_matches(user_id, match_status);

CREATE INDEX IF NOT EXISTS "IDX_email_matches_message"
  ON public.email_prospect_matches(email_message_id);

CREATE INDEX IF NOT EXISTS "IDX_email_matches_prospect"
  ON public.email_prospect_matches(prospect_id);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_email_matches_message_prospect"
  ON public.email_prospect_matches(email_message_id, prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_sync_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  connection_id varchar REFERENCES public.email_connections(id) ON DELETE SET NULL,
  provider varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'queued',
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  messages_seen integer NOT NULL DEFAULT 0,
  messages_stored integer NOT NULL DEFAULT 0,
  matches_created integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_email_sync_runs_user"
  ON public.email_sync_runs(user_id);

CREATE INDEX IF NOT EXISTS "IDX_email_sync_runs_connection"
  ON public.email_sync_runs(connection_id);

CREATE INDEX IF NOT EXISTS "IDX_email_sync_runs_started"
  ON public.email_sync_runs(started_at);
