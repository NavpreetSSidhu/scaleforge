-- User-authored Learn courses. Mirrors the client's built-in course shape
-- (graph + step choreography + optional reference solution) but owned by a user
-- and persisted server-side, so custom HLD/LLD courses appear and play exactly
-- like the pre-seeded ones. The id is the canonical identifier the client routes
-- by; slug is per-user-unique and display-only (can't collide with built-ins).
CREATE TABLE courses (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    difficulty  TEXT NOT NULL,
    category    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    graph       JSONB NOT NULL,
    steps       JSONB NOT NULL,
    solution    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, slug)
);

CREATE INDEX idx_courses_user_id ON courses(user_id);
