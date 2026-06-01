CREATE TABLE IF NOT EXISTS public.intel_surveys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id varchar REFERENCES public.intel_requirements(id) ON DELETE SET NULL,
  title varchar NOT NULL,
  client_name varchar,
  status varchar NOT NULL DEFAULT 'draft',
  share_token varchar UNIQUE,
  created_by_user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT chk_intel_surveys_status
    CHECK (status IN ('draft', 'shared', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_intel_surveys_requirement
  ON public.intel_surveys (requirement_id);

CREATE INDEX IF NOT EXISTS idx_intel_surveys_created_by_user
  ON public.intel_surveys (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_intel_surveys_status
  ON public.intel_surveys (status);

CREATE TABLE IF NOT EXISTS public.intel_survey_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id varchar NOT NULL REFERENCES public.intel_surveys(id) ON DELETE CASCADE,
  listing_id varchar NOT NULL REFERENCES public.intel_listings(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  recommendation_label varchar,
  broker_notes text,
  client_notes text,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT uq_intel_survey_items_listing UNIQUE (survey_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_intel_survey_items_survey
  ON public.intel_survey_items (survey_id);

CREATE INDEX IF NOT EXISTS idx_intel_survey_items_listing
  ON public.intel_survey_items (listing_id);

CREATE INDEX IF NOT EXISTS idx_intel_survey_items_sort
  ON public.intel_survey_items (survey_id, sort_order);
