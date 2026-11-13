-- 0001_core.sql
-- Identity, school settings, master data, document sequences.
--
-- Rules for every migration in this folder:
--   * Money is INTEGER satang (amount_satang). Never REAL/FLOAT.
--   * Dates are ISO 'YYYY-MM-DD'; timestamps are UTC ISO 8601 text.
--   * Migrations only. Never reset or drop tables on production.
--   * No BEGIN/COMMIT/PRAGMA here: D1 always enforces foreign keys and
--     runs each migration file for you.
--   * No secrets, no real passwords, no real names.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE CHECK (length(trim(username)) > 0),
  password_hash TEXT NOT NULL,                     -- hash only (see docs/DEPLOYMENT.md); never plain text
  full_name     TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  position      TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT
);

CREATE TABLE roles (
  id          TEXT PRIMARY KEY,
  role_key    TEXT NOT NULL UNIQUE,
  role_name   TEXT NOT NULL,
  description TEXT
);

CREATE TABLE permissions (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id       TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,                 -- SHA-256 of the cookie token; the token itself is never stored
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE fiscal_years (
  id         TEXT PRIMARY KEY,
  year_be    INTEGER NOT NULL UNIQUE CHECK (year_be BETWEEN 2500 AND 2700),
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date   TEXT NOT NULL CHECK (end_date   GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at  TEXT,
  closed_by  TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_date < end_date),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL))
);

-- School and document settings (what the prototype keeps under Settings > "เอกสารและผู้ลงนาม").
-- Single row. Page margins/font size are a per-device print preference and stay in the browser.
CREATE TABLE school_settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  school_name      TEXT NOT NULL CHECK (length(trim(school_name)) > 0),
  address_line     TEXT NOT NULL,
  area_line        TEXT NOT NULL,
  dept_line        TEXT NOT NULL,                  -- first line of the memo (ส่วนราชการ)
  memo_to_default  TEXT NOT NULL,                  -- default "เรียน"
  show_logo        INTEGER NOT NULL DEFAULT 1 CHECK (show_logo IN (0, 1)),
  memo_signer_role TEXT NOT NULL DEFAULT 'fin' CHECK (memo_signer_role IN ('fin', 'acc', 'dir')),
  crest_object_key TEXT,                           -- Garuda image: private R2 object key (prototype keeps it in the browser)
  updated_at       TEXT,
  updated_by       TEXT REFERENCES users(id)
);

CREATE TABLE document_signers (
  role_key   TEXT PRIMARY KEY CHECK (role_key IN ('fin', 'acc', 'dir')),   -- finance / accountant / director
  full_name  TEXT NOT NULL DEFAULT '',
  position   TEXT NOT NULL DEFAULT '',
  updated_at TEXT,
  updated_by TEXT REFERENCES users(id)
);

CREATE TABLE fund_types (
  id        TEXT PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE fund_sources (
  id           TEXT PRIMARY KEY,
  fund_type_id TEXT NOT NULL REFERENCES fund_types(id),
  source_name  TEXT NOT NULL UNIQUE CHECK (length(trim(source_name)) > 0),
  color        TEXT NOT NULL CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  usage_rules  TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE projects (
  id                   TEXT PRIMARY KEY,
  fiscal_year_id       TEXT NOT NULL REFERENCES fiscal_years(id),
  fund_source_id       TEXT NOT NULL REFERENCES fund_sources(id),
  project_code         TEXT NOT NULL CHECK (length(trim(project_code)) > 0),
  project_name         TEXT NOT NULL CHECK (length(trim(project_name)) > 0),
  budget_amount_satang INTEGER NOT NULL DEFAULT 0 CHECK (typeof(budget_amount_satang) = 'integer' AND budget_amount_satang >= 0),
  status               TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (fiscal_year_id, project_code)
);

-- Receipt / voucher numbers. The prefix format (e.g. 'ร.70/') is a placeholder until the school confirms it.
CREATE TABLE document_sequences (
  id             TEXT PRIMARY KEY,
  fiscal_year_id TEXT NOT NULL REFERENCES fiscal_years(id),
  doc_type       TEXT NOT NULL CHECK (doc_type IN ('receipt', 'voucher')),
  prefix         TEXT NOT NULL,
  last_no        INTEGER NOT NULL DEFAULT 0 CHECK (last_no >= 0),
  UNIQUE (fiscal_year_id, doc_type)
);
