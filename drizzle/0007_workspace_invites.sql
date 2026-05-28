CREATE TABLE IF NOT EXISTS public.listing_invites (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  listing_id varchar NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  email varchar NOT NULL,
  role varchar NOT NULL DEFAULT 'viewer',
  invited_by varchar NOT NULL REFERENCES public.users(id),
  status varchar NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now(),
  accepted_at timestamp
);

CREATE INDEX IF NOT EXISTS "IDX_listing_invites_listing"
  ON public.listing_invites(listing_id);

CREATE INDEX IF NOT EXISTS "IDX_listing_invites_email"
  ON public.listing_invites(email);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_listing_invites_pending_email"
  ON public.listing_invites(listing_id, email)
  WHERE status = 'pending';
