-- Core private-data RLS policies for Level CRE.
-- Run in Supabase SQL editor after reviewing against the current production schema.
-- The API still performs server-side authorization; these policies add defense in depth
-- for any direct Supabase API access through anon/authenticated keys.

alter table if exists public.users enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.prospects enable row level security;
alter table if exists public.submarkets enable row level security;
alter table if exists public.requirements enable row level security;
alter table if exists public.market_comps enable row level security;
alter table if exists public.listings enable row level security;
alter table if exists public.listing_members enable row level security;
alter table if exists public.listing_invites enable row level security;
alter table if exists public.listing_prospects enable row level security;
alter table if exists public.contact_interactions enable row level security;
alter table if exists public.broker_skills enable row level security;
alter table if exists public.skill_activities enable row level security;
alter table if exists public.email_connections enable row level security;
alter table if exists public.email_messages enable row level security;
alter table if exists public.email_prospect_matches enable row level security;
alter table if exists public.email_sync_runs enable row level security;
alter table if exists public.intel_requirements enable row level security;
alter table if exists public.intel_requirement_preferences enable row level security;
alter table if exists public.intel_requirement_listing_decisions enable row level security;
alter table if exists public.intel_surveys enable row level security;
alter table if exists public.intel_survey_items enable row level security;
alter table if exists public.intel_survey_events enable row level security;
alter table if exists public.intel_sources enable row level security;
alter table if exists public.intel_ingest_runs enable row level security;
alter table if exists public.intel_listing_assets enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using ((select auth.uid()::text) = id);

drop policy if exists profiles_self_all on public.profiles;
create policy profiles_self_all on public.profiles
  for all to authenticated
  using ((select auth.uid()::text) = id)
  with check ((select auth.uid()::text) = id);

drop policy if exists prospects_select_owner_or_workspace_member on public.prospects;
create policy prospects_select_owner_or_workspace_member on public.prospects
  for select to authenticated
  using (
    (select auth.uid()::text) = user_id
    or exists (
      select 1
      from public.listing_prospects lp
      join public.listings l on l.id = lp.listing_id
      left join public.listing_members lm
        on lm.listing_id = l.id
       and lm.user_id = (select auth.uid()::text)
      where lp.prospect_id = prospects.id
        and (l.user_id = (select auth.uid()::text) or lm.user_id is not null)
    )
  );

drop policy if exists prospects_insert_owner on public.prospects;
create policy prospects_insert_owner on public.prospects
  for insert to authenticated
  with check ((select auth.uid()::text) = user_id);

drop policy if exists prospects_update_owner_or_workspace_editor on public.prospects;
create policy prospects_update_owner_or_workspace_editor on public.prospects
  for update to authenticated
  using (
    (select auth.uid()::text) = user_id
    or exists (
      select 1
      from public.listing_prospects lp
      join public.listings l on l.id = lp.listing_id
      left join public.listing_members lm
        on lm.listing_id = l.id
       and lm.user_id = (select auth.uid()::text)
      where lp.prospect_id = prospects.id
        and (l.user_id = (select auth.uid()::text) or lm.role = 'editor')
    )
  )
  with check (true);

drop policy if exists prospects_delete_owner on public.prospects;
create policy prospects_delete_owner on public.prospects
  for delete to authenticated
  using ((select auth.uid()::text) = user_id);

drop policy if exists listings_select_owner_or_member on public.listings;
create policy listings_select_owner_or_member on public.listings
  for select to authenticated
  using (
    (select auth.uid()::text) = user_id
    or exists (
      select 1
      from public.listing_members lm
      where lm.listing_id = listings.id
        and lm.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists listings_insert_owner on public.listings;
create policy listings_insert_owner on public.listings
  for insert to authenticated
  with check ((select auth.uid()::text) = user_id);

drop policy if exists listings_update_owner on public.listings;
create policy listings_update_owner on public.listings
  for update to authenticated
  using ((select auth.uid()::text) = user_id)
  with check ((select auth.uid()::text) = user_id);

drop policy if exists listings_delete_owner on public.listings;
create policy listings_delete_owner on public.listings
  for delete to authenticated
  using ((select auth.uid()::text) = user_id);

drop policy if exists listing_members_select_visible_workspace on public.listing_members;
create policy listing_members_select_visible_workspace on public.listing_members
  for select to authenticated
  using (
    user_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.listings l
      left join public.listing_members lm
        on lm.listing_id = l.id
       and lm.user_id = (select auth.uid()::text)
      where l.id = listing_members.listing_id
        and (l.user_id = (select auth.uid()::text) or lm.user_id is not null)
    )
  );

drop policy if exists listing_members_owner_write on public.listing_members;
create policy listing_members_owner_write on public.listing_members
  for all to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_members.listing_id
        and l.user_id = (select auth.uid()::text)
    )
  )
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_members.listing_id
        and l.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists listing_invites_owner_all on public.listing_invites;
create policy listing_invites_owner_all on public.listing_invites
  for all to authenticated
  using (
    invited_by = (select auth.uid()::text)
    or exists (
      select 1 from public.listings l
      where l.id = listing_invites.listing_id
        and l.user_id = (select auth.uid()::text)
    )
  )
  with check (
    invited_by = (select auth.uid()::text)
    and exists (
      select 1 from public.listings l
      where l.id = listing_invites.listing_id
        and l.user_id = (select auth.uid()::text)
    )
  );

drop policy if exists listing_prospects_select_owner_or_member on public.listing_prospects;
create policy listing_prospects_select_owner_or_member on public.listing_prospects
  for select to authenticated
  using (
    exists (
      select 1
      from public.listings l
      left join public.listing_members lm
        on lm.listing_id = l.id
       and lm.user_id = (select auth.uid()::text)
      where l.id = listing_prospects.listing_id
        and (l.user_id = (select auth.uid()::text) or lm.user_id is not null)
    )
  );

drop policy if exists listing_prospects_editor_write_own_prospect on public.listing_prospects;
create policy listing_prospects_editor_write_own_prospect on public.listing_prospects
  for all to authenticated
  using (
    exists (
      select 1
      from public.listings l
      left join public.listing_members lm
        on lm.listing_id = l.id
       and lm.user_id = (select auth.uid()::text)
      where l.id = listing_prospects.listing_id
        and (l.user_id = (select auth.uid()::text) or lm.role = 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.listings l
      left join public.listing_members lm
        on lm.listing_id = l.id
       and lm.user_id = (select auth.uid()::text)
      join public.prospects p on p.id = listing_prospects.prospect_id
      where l.id = listing_prospects.listing_id
        and p.user_id = (select auth.uid()::text)
        and (l.user_id = (select auth.uid()::text) or lm.role = 'editor')
    )
  );

drop policy if exists contact_interactions_select_owner_or_workspace_member on public.contact_interactions;
create policy contact_interactions_select_owner_or_workspace_member on public.contact_interactions
  for select to authenticated
  using (
    user_id = (select auth.uid()::text)
    or (
      listing_id is not null
      and exists (
        select 1
        from public.listings l
        left join public.listing_members lm
          on lm.listing_id = l.id
         and lm.user_id = (select auth.uid()::text)
        where l.id = contact_interactions.listing_id
          and (l.user_id = (select auth.uid()::text) or lm.user_id is not null)
      )
    )
  );

drop policy if exists contact_interactions_insert_owner on public.contact_interactions;
create policy contact_interactions_insert_owner on public.contact_interactions
  for insert to authenticated
  with check (user_id = (select auth.uid()::text));

drop policy if exists contact_interactions_owner_delete on public.contact_interactions;
create policy contact_interactions_owner_delete on public.contact_interactions
  for delete to authenticated
  using (user_id = (select auth.uid()::text));

drop policy if exists submarkets_owner_all on public.submarkets;
create policy submarkets_owner_all on public.submarkets
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists requirements_owner_all on public.requirements;
create policy requirements_owner_all on public.requirements
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists market_comps_owner_all on public.market_comps;
create policy market_comps_owner_all on public.market_comps
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists broker_skills_owner_all on public.broker_skills;
create policy broker_skills_owner_all on public.broker_skills
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists skill_activities_owner_all on public.skill_activities;
create policy skill_activities_owner_all on public.skill_activities
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists email_connections_owner_all on public.email_connections;
create policy email_connections_owner_all on public.email_connections
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists email_messages_owner_all on public.email_messages;
create policy email_messages_owner_all on public.email_messages
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists email_prospect_matches_owner_all on public.email_prospect_matches;
create policy email_prospect_matches_owner_all on public.email_prospect_matches
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists email_sync_runs_owner_all on public.email_sync_runs;
create policy email_sync_runs_owner_all on public.email_sync_runs
  for all to authenticated
  using (user_id = (select auth.uid()::text))
  with check (user_id = (select auth.uid()::text));

drop policy if exists intel_requirements_owner_all on public.intel_requirements;
create policy intel_requirements_owner_all on public.intel_requirements
  for all to authenticated
  using (created_by_user_id = (select auth.uid()::text))
  with check (created_by_user_id = (select auth.uid()::text));

drop policy if exists intel_sources_creator_all on public.intel_sources;
create policy intel_sources_creator_all on public.intel_sources
  for all to authenticated
  using (created_by_user_id = (select auth.uid()::text))
  with check (created_by_user_id = (select auth.uid()::text));

drop policy if exists intel_ingest_runs_initiator_all on public.intel_ingest_runs;
create policy intel_ingest_runs_initiator_all on public.intel_ingest_runs
  for all to authenticated
  using (initiated_by_user_id = (select auth.uid()::text))
  with check (initiated_by_user_id = (select auth.uid()::text));

drop policy if exists intel_requirement_preferences_owner_all on public.intel_requirement_preferences;
create policy intel_requirement_preferences_owner_all on public.intel_requirement_preferences
  for all to authenticated
  using (
    exists (
      select 1 from public.intel_requirements r
      where r.id = intel_requirement_preferences.requirement_id
        and r.created_by_user_id = (select auth.uid()::text)
    )
  )
  with check (
    exists (
      select 1 from public.intel_requirements r
      where r.id = intel_requirement_preferences.requirement_id
        and r.created_by_user_id = (select auth.uid()::text)
    )
  );

drop policy if exists intel_requirement_listing_decisions_owner_all on public.intel_requirement_listing_decisions;
create policy intel_requirement_listing_decisions_owner_all on public.intel_requirement_listing_decisions
  for all to authenticated
  using (
    exists (
      select 1 from public.intel_requirements r
      where r.id = intel_requirement_listing_decisions.requirement_id
        and r.created_by_user_id = (select auth.uid()::text)
    )
  )
  with check (
    exists (
      select 1 from public.intel_requirements r
      where r.id = intel_requirement_listing_decisions.requirement_id
        and r.created_by_user_id = (select auth.uid()::text)
    )
  );

drop policy if exists intel_surveys_owner_all on public.intel_surveys;
create policy intel_surveys_owner_all on public.intel_surveys
  for all to authenticated
  using (created_by_user_id = (select auth.uid()::text))
  with check (created_by_user_id = (select auth.uid()::text));

drop policy if exists intel_survey_items_owner_all on public.intel_survey_items;
create policy intel_survey_items_owner_all on public.intel_survey_items
  for all to authenticated
  using (
    exists (
      select 1 from public.intel_surveys s
      where s.id = intel_survey_items.survey_id
        and s.created_by_user_id = (select auth.uid()::text)
    )
  )
  with check (
    exists (
      select 1 from public.intel_surveys s
      where s.id = intel_survey_items.survey_id
        and s.created_by_user_id = (select auth.uid()::text)
    )
  );

drop policy if exists intel_survey_events_owner_all on public.intel_survey_events;
create policy intel_survey_events_owner_all on public.intel_survey_events
  for all to authenticated
  using (
    actor_id = (select auth.uid()::text)
    or exists (
      select 1 from public.intel_surveys s
      where s.id = intel_survey_events.survey_id
        and s.created_by_user_id = (select auth.uid()::text)
    )
  )
  with check (
    actor_id = (select auth.uid()::text)
    or exists (
      select 1 from public.intel_surveys s
      where s.id = intel_survey_events.survey_id
        and s.created_by_user_id = (select auth.uid()::text)
    )
  );

drop policy if exists intel_listing_assets_creator_all on public.intel_listing_assets;
create policy intel_listing_assets_creator_all on public.intel_listing_assets
  for all to authenticated
  using (created_by_user_id = (select auth.uid()::text))
  with check (created_by_user_id = (select auth.uid()::text));
