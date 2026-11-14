-- 0007_files_in_db.sql
-- Small files kept inside D1 when no R2 bucket is bound to the Worker (R2 needs a payment method on the account).
-- Used for the Garuda crest image only (at most 1 MB). Rows are read only through the Worker, after the session check.

CREATE TABLE stored_files (
  object_key   TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
  data_base64  TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (typeof(size_bytes) = 'integer' AND size_bytes BETWEEN 1 AND 1048576),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
