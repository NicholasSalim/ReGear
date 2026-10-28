-- Stop any single query after 5 seconds. Normal queries finish in
-- milliseconds; a runaway one would otherwise hold a connection, and on a
-- small database a few of those stall the whole site. It applies to the role
-- the app connects as, in this database only, from the next connection on.
-- A later migration that needs longer (e.g. building an index on a large
-- table) starts with: SET statement_timeout = 0;
DO $$
BEGIN
  EXECUTE format('ALTER ROLE %I IN DATABASE %I SET statement_timeout = %L', current_user, current_database(), '5s');
END $$;
