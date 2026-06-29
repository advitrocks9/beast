-- Lock down PostgREST access to the public schema.
--
-- The application reaches the database only through the direct Postgres
-- connection (DATABASE_URL, role `postgres`, which has BYPASSRLS) and uses the
-- Supabase anon key purely for GoTrue auth, never for table reads. But Supabase
-- ships every `public` table with RLS disabled AND full grants to the
-- internet-exposed `anon` / `authenticated` roles, so the public anon key could
-- read, write, and delete every tenant's rows directly via the REST API,
-- bypassing all tRPC company scoping.
--
-- Enabling RLS (with no policies) makes those roles deny-by-default; revoking
-- the grants removes the capability entirely. Neither affects the app, since
-- the `postgres` role bypasses RLS. Idempotent: safe to re-run.

-- Enable RLS on every existing table in the public schema.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
--> statement-breakpoint

-- Revoke all table/sequence privileges from the API roles and stop future
-- tables from inheriting them. Guarded so this still runs on a plain Postgres
-- (a local clone) where the Supabase roles do not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END $$;
