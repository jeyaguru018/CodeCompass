package com.codecompass.backend.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Runs on backend startup to ensure that the python_readonly role exists
 * and has strictly column-scoped SELECT access to repositories (id, faiss_index_data) only.
 * Doing this here guarantees that Hibernate has already created the tables.
 */
@Component
public class DatabaseRoleInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseRoleInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(String... args) throws Exception {
        try {
            // 1. Create the role if it doesn't exist
            jdbcTemplate.execute("DO $$\n" +
                    "BEGIN\n" +
                    "    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'python_readonly') THEN\n" +
                    "        CREATE ROLE python_readonly WITH LOGIN PASSWORD 'readonly_pass';\n" +
                    "    END IF;\n" +
                    "END $$;");

            // 2. Revoke all privileges first to enforce deny-by-default
            jdbcTemplate.execute("REVOKE ALL ON SCHEMA public FROM python_readonly");
            jdbcTemplate.execute("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM python_readonly");

            // 3. Grant schema usage
            jdbcTemplate.execute("GRANT USAGE ON SCHEMA public TO python_readonly");

            // 4. Grant column-scoped SELECT permissions (only id and faiss_index_data)
            jdbcTemplate.execute("GRANT SELECT (id, faiss_index_data) ON repositories TO python_readonly");

            System.out.println("=================================================================");
            System.out.println("SUCCESS: Enforced engine-level read-only grants for python_readonly");
            System.out.println("=================================================================");
        } catch (Exception e) {
            System.err.println("=================================================================");
            System.err.println("WARNING: Could not apply python_readonly database grants: " + e.getMessage());
            System.err.println("=================================================================");
        }
    }
}
