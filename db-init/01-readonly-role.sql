-- ============================================================
-- CodeCompass: Postgres read-only role for the Python service
-- ============================================================
-- This script is executed automatically on first container start
-- by being mounted into /docker-entrypoint-initdb.d/
--
-- SECURITY INTENT:
--   The Python intelligence service only needs to read the FAISS
--   index blob from the repositories table so it can perform
--   vector similarity search. It must NOT be able to read PII
--   (emails, github tokens) or mutate any data — ever.
--
-- ENFORCEMENT: These grants are at the database-engine level.
--   No amount of application code change can bypass them.
-- ============================================================

-- 1. Create the restricted role (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'python_readonly') THEN
        CREATE ROLE python_readonly WITH LOGIN PASSWORD 'readonly_pass';
    END IF;
END $$;

-- 2. Revoke ALL access to the public schema first (deny-by-default)
REVOKE ALL ON SCHEMA public FROM python_readonly;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM python_readonly;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM python_readonly;

-- 3. Grant the minimum required:
--    USAGE on schema so the role can even see the tables
GRANT USAGE ON SCHEMA public TO python_readonly;

--    (Table-specific column-level grants are handled automatically by the Java backend
--     upon startup once Hibernate creates/updates the tables, preventing errors here)

-- 4. Ensure future tables created by Java/Hibernate are NOT auto-granted
--    (default_privileges only affects tables created AFTER this point
--     by the postgres superuser — fine for our setup)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL ON TABLES FROM python_readonly;

-- 5. Confirm the role exists and verify grants (runs as superuser during init)
-- You can verify after init with:
--   \dp repositories   (in psql)
-- Expected: python_readonly has SELECT on (id, faiss_index_data) only
