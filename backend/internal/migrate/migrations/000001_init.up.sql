CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE architectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    graph JSONB NOT NULL DEFAULT '{}',
    traffic JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_architectures_user_id ON architectures(user_id);

CREATE TABLE simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    architecture_id UUID REFERENCES architectures(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_simulations_architecture_id ON simulations(architecture_id);
CREATE INDEX idx_simulations_user_id ON simulations(user_id);

CREATE TABLE node_definitions (
    type TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    label TEXT NOT NULL,
    base_latency_ms DOUBLE PRECISION NOT NULL,
    per_instance_capacity_rps DOUBLE PRECISION NOT NULL,
    unit_monthly_cost_usd DOUBLE PRECISION NOT NULL,
    default_config JSONB NOT NULL DEFAULT '{}'
);

INSERT INTO users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000001', 'dev@scaleforge.local')
ON CONFLICT (id) DO NOTHING;
