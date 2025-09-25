-- Option A: Create profile in public.profiles when a Supabase Auth user is created
-- Safe to run multiple times (trigger is dropped/recreated; upsert is idempotent)

-- Function that inserts a default profile row for every new auth.users record
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    profile_image_url,
    market_city,
    submarkets,
    asset_classes,
    created_at,
    updated_at
  )
  values (
    new.id::text,
    new.email,
    coalesce(nullif(trim((new.raw_user_meta_data->>'full_name')), ''), split_part(coalesce(new.email,''),'@',1)),
    nullif(split_part(coalesce(new.raw_user_meta_data->>'full_name',''),' ',1),''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name',''), '^[^ ]* ?', ''),''),
    coalesce(new.raw_user_meta_data->>'avatar_url', null),
    'Edmonton',
    '[]'::jsonb,
    '[]'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Recreate trigger to ensure it exists and points at the latest function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

-- Optional one-time backfill for existing auth users without a profile
-- Run once; safe to re-run because of the left join null filter
insert into public.profiles (
  id,
  email,
  name,
  first_name,
  last_name,
  profile_image_url,
  market_city,
  submarkets,
  asset_classes,
  created_at,
  updated_at
)
select
  u.id::text,
  u.email,
  coalesce(nullif(trim((u.raw_user_meta_data->>'full_name')), ''), split_part(coalesce(u.email,''),'@',1)),
  nullif(split_part(coalesce(u.raw_user_meta_data->>'full_name',''),' ',1),''),
  nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'full_name',''), '^[^ ]* ?', ''),''),
  coalesce(u.raw_user_meta_data->>'avatar_url', null),
  'Edmonton',
  '[]'::jsonb,
  '[]'::jsonb,
  now(),
  now()
from auth.users u
left join public.profiles p on p.id = u.id::text
where p.id is null;

