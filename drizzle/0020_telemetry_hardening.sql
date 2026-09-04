-- Additive telemetry hardening. No historical CRM rows are rewritten.
CREATE TABLE IF NOT EXISTS public.interaction_event_receipts (
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_provider varchar NOT NULL,
  source_message_id varchar NOT NULL,
  prospect_id varchar NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  interaction_id varchar REFERENCES public.contact_interactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_provider, source_message_id, prospect_id)
);
CREATE TABLE IF NOT EXISTS public.automation_event_payloads (
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  producer_id varchar(120) NOT NULL,
  source varchar NOT NULL,
  external_activity_id varchar NOT NULL,
  fingerprint varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, producer_id, source, external_activity_id)
);
CREATE TABLE IF NOT EXISTS public.automation_runs (
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  producer_id varchar(120) NOT NULL,
  run_id varchar(120) NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  status varchar NOT NULL,
  applied integer NOT NULL DEFAULT 0,
  needs_review integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  queued integer,
  scanned_through timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, producer_id, run_id)
);
CREATE INDEX IF NOT EXISTS automation_runs_user_recent ON public.automation_runs(user_id, acknowledged_at DESC);
CREATE TABLE IF NOT EXISTS public.ingestion_rate_windows (
  identity varchar PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  requests integer NOT NULL
);
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['interaction_event_receipts','automation_event_payloads','automation_runs','ingestion_rate_windows','sales_activity_imports','activity_events','activity_event_links'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Only a change hint leaves the database, never a CRM row. Database triggers
-- also cover writers outside the API. Polling remains available if Realtime is down.
CREATE OR REPLACE FUNCTION public.levelcre_broadcast_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN owner_id := OLD.user_id::text; ELSE owner_id := NEW.user_id::text; END IF;
  IF owner_id IS NOT NULL AND to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed', 'levelcre:user:' || owner_id, true);
      IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        PERFORM realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed', 'levelcre:user:' || OLD.user_id::text, true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- A realtime outage must not reject a confirmed business event.
      RAISE WARNING 'LevelCRE change broadcast unavailable: %', SQLSTATE;
    END;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.levelcre_broadcast_change() FROM PUBLIC;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['prospects','contact_interactions','sales_activity_imports','activity_events','opportunities','skill_activities','automation_runs'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS levelcre_telemetry_change ON public.%I', table_name);
      EXECUTE format('CREATE TRIGGER levelcre_telemetry_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.levelcre_broadcast_change()', table_name);
    END IF;
  END LOOP;
  IF to_regclass('realtime.messages') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT ON realtime.messages TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS levelcre_private_changes ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS levelcre_private_changes_guard ON realtime.messages';
    EXECUTE $policy$CREATE POLICY levelcre_private_changes_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (realtime.topic() NOT LIKE 'levelcre:user:%' OR (realtime.topic() = 'levelcre:user:' || (SELECT auth.uid())::text AND topic = realtime.topic()))$policy$;
    EXECUTE $policy$CREATE POLICY levelcre_private_changes ON realtime.messages FOR SELECT TO authenticated
      USING (realtime.topic() = 'levelcre:user:' || (SELECT auth.uid())::text)$policy$;
  END IF;
END $$;
