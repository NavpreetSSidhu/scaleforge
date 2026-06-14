-- Per-user progress through the Learn module's courses. Course content (steps,
-- designs, animation choreography) is authored on the client; only the learner's
-- progress is persisted here.
CREATE TABLE lesson_progress (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_slug     TEXT NOT NULL,
    completed_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, course_slug)
);

CREATE INDEX idx_lesson_progress_user_id ON lesson_progress(user_id);
