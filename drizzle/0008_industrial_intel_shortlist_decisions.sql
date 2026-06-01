CREATE TABLE IF NOT EXISTS public.intel_requirement_listing_decisions (
  requirement_id varchar NOT NULL REFERENCES public.intel_requirements(id) ON DELETE CASCADE,
  listing_id varchar NOT NULL REFERENCES public.intel_listings(id) ON DELETE CASCADE,
  decision varchar NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT pk_intel_requirement_listing_decisions PRIMARY KEY (requirement_id, listing_id),
  CONSTRAINT chk_intel_requirement_listing_decision
    CHECK (decision IN ('shortlist', 'maybe', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_intel_requirement_listing_decisions_requirement
  ON public.intel_requirement_listing_decisions (requirement_id);

CREATE INDEX IF NOT EXISTS idx_intel_requirement_listing_decisions_listing
  ON public.intel_requirement_listing_decisions (listing_id);

CREATE INDEX IF NOT EXISTS idx_intel_requirement_listing_decisions_decision
  ON public.intel_requirement_listing_decisions (requirement_id, decision);

CREATE INDEX IF NOT EXISTS idx_intel_requirement_listing_decisions_sort
  ON public.intel_requirement_listing_decisions (requirement_id, decision, sort_order);
