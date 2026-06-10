-- Real accounts: store a display name and a bcrypt password hash on users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

-- Give the seeded dev user a friendly name (it has no password and cannot log in).
UPDATE users SET name = 'Dev User'
WHERE id = '00000000-0000-0000-0000-000000000001' AND name = '';
