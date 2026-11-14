ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));
CREATE TABLE login_attempts ( username_key TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0), locked_until TEXT, last_failed_at TEXT );
