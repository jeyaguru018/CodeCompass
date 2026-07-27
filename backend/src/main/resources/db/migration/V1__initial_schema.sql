-- =============================================================================
-- V1__initial_schema.sql
-- Baseline schema capturing the full database state as of initial development.
-- This migration represents the schema that was previously managed by
-- Hibernate's ddl-auto: update. All subsequent changes MUST go through
-- numbered Flyway migrations (V2__, V3__, etc).
-- =============================================================================

-- Extension for UUID generation (already installed but idempotent here)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255),
    full_name character varying(255) NOT NULL,
    github_login character varying(255),
    github_access_token text,
    plan character varying(20),
    ai_tokens_used integer,
    ai_tokens_reset_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone,
    last_login_at timestamp(6) without time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT uk6dotkott2kjsp8vw4d0m25fb7 UNIQUE (email),
    CONSTRAINT ukbsb3k1ssoj8x08padtwp79q8n UNIQUE (github_login)
);

-- ─── repositories ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.repositories (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    github_owner character varying(120) NOT NULL,
    github_name character varying(120) NOT NULL,
    github_url text NOT NULL,
    description text,
    primary_language character varying(60),
    language_breakdown jsonb,
    star_count integer,
    fork_count integer,
    status character varying(30),
    analysis_progress integer,
    analysis_step text,
    faiss_index_id character varying(120),
    faiss_index_data bytea,
    file_count integer,
    function_count integer,
    hotspot_count integer,
    ai_summary text,
    analyzed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone,
    CONSTRAINT repositories_pkey PRIMARY KEY (id),
    CONSTRAINT fk7ufrpdgoll6ftsk8i4vdio8r9 FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- ─── repo_files ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.repo_files (
    id uuid NOT NULL,
    repo_id uuid NOT NULL,
    file_path text NOT NULL,
    file_name character varying(255) NOT NULL,
    language character varying(60),
    size_bytes integer,
    line_count integer,
    complexity_score real,
    churn_score real,
    hotspot_score real,
    is_hotspot boolean,
    is_entry_point boolean,
    module_type character varying(60),
    ai_summary text,
    raw_content text,
    vector_chunk_ids jsonb,
    last_commit_at timestamp(6) without time zone,
    last_commit_message text,
    CONSTRAINT repo_files_pkey PRIMARY KEY (id),
    CONSTRAINT fkd2n2ditu85ox77egtefyvc0mb FOREIGN KEY (repo_id) REFERENCES public.repositories(id)
);

-- ─── repo_functions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.repo_functions (
    id uuid NOT NULL,
    file_id uuid NOT NULL,
    repo_id uuid NOT NULL,
    function_name character varying(255) NOT NULL,
    class_name character varying(255),
    start_line integer NOT NULL,
    end_line integer NOT NULL,
    parameters jsonb,
    return_type text,
    content text,
    faiss_id bigint,
    complexity_score real,
    ai_summary text,
    CONSTRAINT repo_functions_pkey PRIMARY KEY (id),
    CONSTRAINT fk1e06n5tx77iqjvsmehbe5kf8y FOREIGN KEY (file_id) REFERENCES public.repo_files(id),
    CONSTRAINT fkmogu4a3x0w7vj6uk8xj4mcc5b FOREIGN KEY (repo_id) REFERENCES public.repositories(id)
);

-- ─── dependency_edges ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dependency_edges (
    id uuid NOT NULL,
    repo_id uuid NOT NULL,
    source_file_id uuid NOT NULL,
    target_file_id uuid,
    import_statement text NOT NULL,
    is_external boolean,
    external_package character varying(255),
    CONSTRAINT dependency_edges_pkey PRIMARY KEY (id),
    CONSTRAINT fk15igfrspirj0etsei8vyy9gug FOREIGN KEY (repo_id) REFERENCES public.repositories(id),
    CONSTRAINT fkqu6c2c7l7doxetsde9y2glwpv FOREIGN KEY (source_file_id) REFERENCES public.repo_files(id),
    CONSTRAINT fk75xpib7rxs70q56j57pco1ql6 FOREIGN KEY (target_file_id) REFERENCES public.repo_files(id)
);

-- ─── onboarding_steps ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_steps (
    id uuid NOT NULL,
    repo_id uuid NOT NULL,
    file_id uuid,
    title character varying(255),
    content text,
    step_order integer,
    step_type character varying(60),
    CONSTRAINT onboarding_steps_pkey PRIMARY KEY (id),
    CONSTRAINT fk7fn5xsntsyjg4pr19e7cnwiel FOREIGN KEY (repo_id) REFERENCES public.repositories(id),
    CONSTRAINT fk7o0qe8v6jcqsrdwexdsavjnmb FOREIGN KEY (file_id) REFERENCES public.repo_files(id)
);

-- ─── user_onboarding_progress ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_onboarding_progress (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    step_id uuid NOT NULL,
    completed_at timestamp(6) without time zone,
    CONSTRAINT user_onboarding_progress_pkey PRIMARY KEY (id),
    CONSTRAINT fk90x57gognp039p0wvnrb25iap FOREIGN KEY (user_id) REFERENCES public.users(id),
    CONSTRAINT fkcu7b99gfk5tyyyhvba90th1qd FOREIGN KEY (step_id) REFERENCES public.onboarding_steps(id)
);

-- ─── chat_sessions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    repo_id uuid NOT NULL,
    title character varying(255),
    last_message_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone,
    CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT fk601hxh65vssidc17xfa68dr9m FOREIGN KEY (repo_id) REFERENCES public.repositories(id),
    CONSTRAINT fk82ky97glaomlmhjqae1d0esmy FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- ─── chat_messages ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id uuid NOT NULL,
    session_id uuid NOT NULL,
    role character varying(20) NOT NULL,
    content text NOT NULL,
    context_file_id uuid,
    context_function character varying(255),
    cited_file_ids jsonb,
    cited_line_ranges jsonb,
    tokens_used integer,
    created_at timestamp(6) without time zone,
    CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
    CONSTRAINT fk3cpkdtwdxndrjhrx3gt9q5ux9 FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id),
    CONSTRAINT fkpknk2u4rrc41mul8twgfkg9er FOREIGN KEY (context_file_id) REFERENCES public.repo_files(id)
);

-- ─── refresh_tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    revoked boolean NOT NULL DEFAULT false,
    created_at timestamp(6) without time zone,
    CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT uko2mlirhldriil2y7krapq4frt UNIQUE (token_hash),
    CONSTRAINT fk1lih5y2npsf8u5o3vhdb9y0os FOREIGN KEY (user_id) REFERENCES public.users(id)
);
