CREATE TABLE IF NOT EXISTS public.intel_requirements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id varchar NOT NULL REFERENCES public.users(id),
  title varchar NOT NULL,
  client_name varchar,
  status varchar NOT NULL DEFAULT 'draft',
  deal_type varchar NOT NULL DEFAULT 'lease',
  market varchar,
  submarket varchar,
  min_sf integer,
  max_sf integer,
  min_clear_height_ft numeric(6, 2),
  max_budget_psf numeric(12, 2),
  required_dock_doors integer,
  required_grade_doors integer,
  min_yard_acres numeric(10, 2),
  power_notes text,
  office_notes text,
  timing_notes text,
  special_notes text,
  is_off_market_search_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  archived_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_intel_requirements_user
  ON public.intel_requirements (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_intel_requirements_status
  ON public.intel_requirements (status);

CREATE INDEX IF NOT EXISTS idx_intel_requirements_market
  ON public.intel_requirements (market);

CREATE INDEX IF NOT EXISTS idx_intel_requirements_submarket
  ON public.intel_requirements (submarket);

CREATE INDEX IF NOT EXISTS idx_intel_requirements_archived_at
  ON public.intel_requirements (archived_at);

CREATE TABLE IF NOT EXISTS public.intel_requirement_preferences (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id varchar NOT NULL REFERENCES public.intel_requirements(id) ON DELETE CASCADE,
  key varchar NOT NULL,
  operator varchar NOT NULL DEFAULT 'preferred',
  value_text text,
  value_number numeric(12, 2),
  value_boolean boolean,
  weight integer NOT NULL DEFAULT 1,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intel_requirement_preferences_requirement
  ON public.intel_requirement_preferences (requirement_id);

CREATE INDEX IF NOT EXISTS idx_intel_requirement_preferences_requirement_key
  ON public.intel_requirement_preferences (requirement_id, key);
