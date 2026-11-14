-- 0008_fund_color_check.sql
-- Cloudflare D1 accepts at most 50 bytes in a LIKE/GLOB pattern (developers.cloudflare.com/d1/platform/limits).
-- The colour CHECK on fund_sources (0001) used a 67-byte GLOB, so on D1 every insert into fund_sources failed with
-- "LIKE or GLOB pattern too complex". SQLite cannot change a CHECK in place, so the table is rebuilt with an
-- equivalent short check (7 characters, '#' then hex digits only).
--
-- On D1 the table is always empty when this runs, because no row could ever be inserted there.
-- On another SQLite build that already holds funds referenced by other tables, DROP TABLE fails on the
-- foreign keys and the whole migration rolls back; nothing is lost, and that database does not need it.
-- The three views that read fund_sources are dropped first and recreated unchanged at the end.
-- This is the only migration allowed to DROP, and only these objects (tests/db/verify.py checks the list).

DROP VIEW v_integrity_issues;
DROP VIEW v_integrity_issues_ledger;
DROP VIEW v_fund_summary;

CREATE TABLE fund_sources_new (
  id           TEXT PRIMARY KEY,
  fund_type_id TEXT NOT NULL REFERENCES fund_types(id),
  source_name  TEXT NOT NULL UNIQUE CHECK (length(trim(source_name)) > 0),
  color        TEXT NOT NULL CHECK (length(color) = 7 AND substr(color, 1, 1) = '#' AND NOT (substr(color, 2) GLOB '*[^0-9A-Fa-f]*')),
  usage_rules  TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO fund_sources_new (id, fund_type_id, source_name, color, usage_rules, is_active, created_at)
SELECT id, fund_type_id, source_name, color, usage_rules, is_active, created_at FROM fund_sources;

DROP TABLE fund_sources;

ALTER TABLE fund_sources_new RENAME TO fund_sources;

CREATE VIEW v_fund_summary AS
SELECT f.id AS fund_source_id,
       f.source_name,
       f.color,
       COALESCE(SUM(CASE WHEN l.kind = 'opening'          THEN l.amount_satang END), 0)  AS opening_satang,
       COALESCE(SUM(CASE WHEN l.source_type = 'income'    THEN l.amount_satang END), 0)  AS income_net_satang,
       COALESCE(-SUM(CASE WHEN l.source_type = 'expense'  THEN l.amount_satang END), 0)  AS expense_net_satang,
       COALESCE(SUM(CASE WHEN l.kind = 'adjustment'       THEN l.amount_satang END), 0)  AS adjustment_satang,
       COALESCE(SUM(l.amount_satang), 0)                                                 AS balance_satang,
       (SELECT COALESCE(SUM(e.amount_satang), 0) FROM expense_transactions e
         WHERE e.fund_source_id = f.id AND e.status = 'approved')                        AS committed_satang
  FROM fund_sources f
  LEFT JOIN ledger_entries l ON l.fund_source_id = f.id
 GROUP BY f.id;

CREATE VIEW v_integrity_issues_ledger AS
SELECT 'expense_reversed_without_reversal_entry' AS issue, t.id AS entity_id
  FROM expense_transactions t
 WHERE t.status = 'reversed'
   AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.kind = 'reversal' AND l.source_type = 'expense' AND l.source_id = t.id)
UNION ALL
SELECT 'ledger_posted_twice_for_same_source', l.source_id
  FROM ledger_entries l
 WHERE l.kind IN ('income', 'expense')
 GROUP BY l.kind, l.source_id
HAVING COUNT(*) > 1
UNION ALL
SELECT 'negative_fund_balance', s.fund_source_id
  FROM v_fund_summary s
 WHERE s.balance_satang < 0;

CREATE VIEW v_integrity_issues AS
SELECT issue, entity_id FROM v_integrity_issues_tx
UNION ALL
SELECT issue, entity_id FROM v_integrity_issues_ledger;
