CREATE TABLE IF NOT EXISTS public.resident_loyalty_landlords (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  owner_user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  manager_name varchar,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resident_loyalty_buildings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  landlord_id varchar NOT NULL REFERENCES public.resident_loyalty_landlords(id) ON DELETE CASCADE,
  name varchar NOT NULL,
  address text,
  neighbourhood varchar,
  portal_slug varchar NOT NULL,
  unit_count integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resident_loyalty_units (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  building_id varchar NOT NULL REFERENCES public.resident_loyalty_buildings(id) ON DELETE CASCADE,
  unit_number varchar NOT NULL,
  floor integer,
  bedrooms integer,
  occupancy_status varchar NOT NULL DEFAULT 'vacant',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resident_loyalty_residents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  building_id varchar NOT NULL REFERENCES public.resident_loyalty_buildings(id) ON DELETE CASCADE,
  unit_id varchar NOT NULL REFERENCES public.resident_loyalty_units(id) ON DELETE CASCADE,
  user_id varchar REFERENCES public.users(id) ON DELETE SET NULL,
  name varchar NOT NULL,
  email varchar NOT NULL,
  move_in_date date,
  rent_streak_months integer NOT NULL DEFAULT 0,
  autopay_status varchar NOT NULL DEFAULT 'not_set',
  renewal_window varchar NOT NULL DEFAULT 'not_due',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resident_loyalty_memberships (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  landlord_id varchar NOT NULL REFERENCES public.resident_loyalty_landlords(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resident_id varchar REFERENCES public.resident_loyalty_residents(id) ON DELETE CASCADE,
  role varchar NOT NULL DEFAULT 'landlord_owner',
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resident_loyalty_tenant_lifecycles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resident_id varchar NOT NULL REFERENCES public.resident_loyalty_residents(id) ON DELETE CASCADE,
  building_id varchar NOT NULL REFERENCES public.resident_loyalty_buildings(id) ON DELETE CASCADE,
  unit_id varchar NOT NULL REFERENCES public.resident_loyalty_units(id) ON DELETE CASCADE,
  invite_status varchar NOT NULL DEFAULT 'draft',
  portal_slug varchar NOT NULL,
  lease_document_name varchar,
  lease_status varchar NOT NULL DEFAULT 'missing',
  lease_start_date date,
  lease_end_date date,
  lease_acknowledged_at timestamp,
  security_deposit_amount_label varchar,
  security_deposit_status varchar NOT NULL DEFAULT 'not_requested',
  security_deposit_confirmed_at timestamp,
  next_rent_amount_label varchar,
  next_rent_due_date date,
  next_rent_status varchar NOT NULL DEFAULT 'not_due',
  move_in_inspection_status varchar NOT NULL DEFAULT 'not_started',
  move_in_photo_count integer NOT NULL DEFAULT 0,
  move_in_issue_count integer NOT NULL DEFAULT 0,
  move_in_submitted_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resident_loyalty_onboarding_steps (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resident_id varchar NOT NULL REFERENCES public.resident_loyalty_residents(id) ON DELETE CASCADE,
  building_id varchar NOT NULL REFERENCES public.resident_loyalty_buildings(id) ON DELETE CASCADE,
  unit_id varchar NOT NULL REFERENCES public.resident_loyalty_units(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  title varchar NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar NOT NULL DEFAULT 'todo',
  points integer,
  due_at timestamp,
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_landlords_owner"
  ON public.resident_loyalty_landlords(owner_user_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_buildings_landlord"
  ON public.resident_loyalty_buildings(landlord_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_buildings_slug"
  ON public.resident_loyalty_buildings(portal_slug);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_units_building"
  ON public.resident_loyalty_units(building_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_units_number"
  ON public.resident_loyalty_units(building_id, unit_number);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_residents_building"
  ON public.resident_loyalty_residents(building_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_residents_unit"
  ON public.resident_loyalty_residents(unit_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_residents_user"
  ON public.resident_loyalty_residents(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_residents_unit_email"
  ON public.resident_loyalty_residents(unit_id, email);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_memberships_landlord"
  ON public.resident_loyalty_memberships(landlord_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_memberships_user"
  ON public.resident_loyalty_memberships(user_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_memberships_resident"
  ON public.resident_loyalty_memberships(resident_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_owner_memberships"
  ON public.resident_loyalty_memberships(landlord_id, user_id, role)
  WHERE resident_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_resident_memberships"
  ON public.resident_loyalty_memberships(landlord_id, user_id, role, resident_id)
  WHERE resident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_lifecycles_resident"
  ON public.resident_loyalty_tenant_lifecycles(resident_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_lifecycles_building"
  ON public.resident_loyalty_tenant_lifecycles(building_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_lifecycles_resident"
  ON public.resident_loyalty_tenant_lifecycles(resident_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_steps_resident"
  ON public.resident_loyalty_onboarding_steps(resident_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_steps_building"
  ON public.resident_loyalty_onboarding_steps(building_id);
CREATE INDEX IF NOT EXISTS "IDX_resident_loyalty_steps_status"
  ON public.resident_loyalty_onboarding_steps(status);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_resident_loyalty_steps_type"
  ON public.resident_loyalty_onboarding_steps(resident_id, type);
