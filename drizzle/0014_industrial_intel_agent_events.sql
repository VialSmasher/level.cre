CREATE TABLE IF NOT EXISTS public.intel_agent_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  agent_name varchar,
  request_id varchar,
  method varchar NOT NULL,
  path text NOT NULL,
  action varchar NOT NULL,
  status_code integer,
  success boolean NOT NULL DEFAULT true,
  duration_ms integer,
  entity_type varchar,
  entity_id varchar,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intel_agent_events_user
  ON public.intel_agent_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_agent_events_agent
  ON public.intel_agent_events (agent_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_agent_events_request
  ON public.intel_agent_events (request_id);

CREATE INDEX IF NOT EXISTS idx_intel_agent_events_action
  ON public.intel_agent_events (action);

ALTER TABLE public.intel_agent_events ENABLE ROW LEVEL SECURITY;
