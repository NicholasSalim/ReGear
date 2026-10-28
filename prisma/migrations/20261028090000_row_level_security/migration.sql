-- Turn on row-level security for every table, with no policies. On Supabase,
-- tables in "public" are also reachable through its Data API with the
-- project's publishable key; with RLS on and no policies that API sees no
-- rows. The app is unaffected: it connects as the tables' owner, and RLS
-- does not apply to a table's owner.
-- Tables added by later migrations need their own ENABLE ROW LEVEL SECURITY.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
