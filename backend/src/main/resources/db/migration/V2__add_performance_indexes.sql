-- =============================================================================
-- V2__add_performance_indexes.sql
-- Production performance indexes added in the hardening pass.
-- These indexes map to real query patterns:
--   users.email          → every login (WHERE email = ?)
--   users.github_login   → every GitHub OAuth callback
--   repositories.user_id → dashboard load (WHERE user_id = ?)
--   repositories.(user_id, status) → filtered dashboard queries
--   repo_files.repo_id   → Explorer tab (WHERE repo_id = ?)
--   repo_files.(repo_id, file_path) → single-file lookup
--   repo_functions.file_id  → functions-in-file panel (WHERE file_id = ?)
--   repo_functions.repo_id  → total function count (WHERE repo_id = ?)
--   dependency_edges.repo_id         → architecture graph (WHERE repo_id = ?)
--   dependency_edges.source_file_id  → outgoing edges per file
--   dependency_edges.target_file_id  → incoming edges per file
--   chat_messages.(session_id, created_at) → chat history in order
-- =============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_user_email        ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_user_github_login ON public.users (github_login);

-- Repositories
CREATE INDEX IF NOT EXISTS idx_repo_user_id     ON public.repositories (user_id);
CREATE INDEX IF NOT EXISTS idx_repo_user_status ON public.repositories (user_id, status);

-- Repo files
CREATE INDEX IF NOT EXISTS idx_repofile_repo_id   ON public.repo_files (repo_id);
CREATE INDEX IF NOT EXISTS idx_repofile_repo_path ON public.repo_files (repo_id, file_path);

-- Repo functions (was missing from initial hardening pass)
CREATE INDEX IF NOT EXISTS idx_repofunc_file_id ON public.repo_functions (file_id);
CREATE INDEX IF NOT EXISTS idx_repofunc_repo_id ON public.repo_functions (repo_id);

-- Dependency edges
CREATE INDEX IF NOT EXISTS idx_dep_edge_repo_id ON public.dependency_edges (repo_id);
CREATE INDEX IF NOT EXISTS idx_dep_edge_source  ON public.dependency_edges (source_file_id);
CREATE INDEX IF NOT EXISTS idx_dep_edge_target  ON public.dependency_edges (target_file_id);

-- Chat messages
CREATE INDEX IF NOT EXISTS idx_chatmsg_session_created ON public.chat_messages (session_id, created_at);
