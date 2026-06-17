-- Agent Studio: user-authored agentic LLM workflows. Mirrors the courses table —
-- a per-user-owned graph persisted as JSONB so the same design drives the
-- Monte-Carlo simulator, the live dry-run runtime, and the code exporters. The id
-- is the canonical identifier the client routes by; slug is per-user-unique and
-- display-only.
CREATE TABLE workflows (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    graph       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, slug)
);

CREATE INDEX idx_workflows_user_id ON workflows(user_id);
