-- 0006_auth.sql
-- Login support: forced password change after an admin sets a password, and lockout after repeated failures.
-- Passwords are stored only as a salted PBKDF2-SHA256 hash (see apps/api/src/services/password.ts).

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));

CREATE TABLE login_attempts (
  username_key   TEXT PRIMARY KEY,                 -- lower-cased username as typed (may not be a real account)
  failed_count   INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  locked_until   TEXT,
  last_failed_at TEXT
);
