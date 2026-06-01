CREATE TABLE IF NOT EXISTS public.intel_survey_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id varchar NOT NULL REFERENCES public.intel_surveys(id) ON DELETE CASCADE,
  actor_type varchar NOT NULL DEFAULT 'user',
  actor_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  action varchar NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  CONSTRAINT chk_intel_survey_events_actor_type
    CHECK (actor_type IN ('user', 'agent', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_intel_survey_events_survey
  ON public.intel_survey_events (survey_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intel_survey_events_actor
  ON public.intel_survey_events (actor_type, actor_id);

CREATE INDEX IF NOT EXISTS idx_intel_survey_events_action
  ON public.intel_survey_events (action);
