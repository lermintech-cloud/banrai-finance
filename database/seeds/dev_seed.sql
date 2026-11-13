-- dev_seed.sql  -- DEVELOPMENT ONLY. Fake sample data that mirrors the prototype.
-- Never run this on the production database. Run it only after migrations 0001-0005.
--   npx wrangler d1 execute DB --local --file=../../database/seeds/dev_seed.sql
-- Users are created DISABLED (is_active = 0) with a placeholder that is not a real hash,
-- so nobody can log in. Real accounts are created by the user-admin flow (docs/DEPLOYMENT.md).
-- Real names, account numbers, phone numbers and signatures must never be added here.
--
-- Transactions are walked through the same status steps as real use, so every trigger and
-- constraint in 0003 is exercised by this file.

-- ---- users (disabled)
INSERT INTO users (id, username, password_hash, full_name, position, is_active, created_at) VALUES ('u-admin', 'dev.admin', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH', 'ผู้ดูแลระบบ (ตัวอย่าง)', 'ผู้ดูแลระบบ', 0, '2026-10-01T00:00:00.000Z');
INSERT INTO users (id, username, password_hash, full_name, position, is_active, created_at) VALUES ('u-fin', 'dev.finance', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH', 'สมชาย (ตัวอย่าง)', 'เจ้าหน้าที่การเงิน', 0, '2026-10-01T00:00:00.000Z');
INSERT INTO users (id, username, password_hash, full_name, position, is_active, created_at) VALUES ('u-acc', 'dev.accountant', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH', 'สมหญิง (ตัวอย่าง)', 'เจ้าหน้าที่บัญชี', 0, '2026-10-01T00:00:00.000Z');
INSERT INTO users (id, username, password_hash, full_name, position, is_active, created_at) VALUES ('u-dir', 'dev.director', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH', 'ผู้อำนวยการ (ตัวอย่าง)', 'ผู้อำนวยการ', 0, '2026-10-01T00:00:00.000Z');
INSERT INTO users (id, username, password_hash, full_name, position, is_active, created_at) VALUES ('u-aud', 'dev.auditor', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH', 'ผู้ตรวจสอบ (ตัวอย่าง)', 'ผู้ตรวจสอบ', 0, '2026-10-01T00:00:00.000Z');
INSERT INTO user_roles (user_id, role_id) VALUES ('u-admin', 'role-super-admin');
INSERT INTO user_roles (user_id, role_id) VALUES ('u-fin', 'role-finance');
INSERT INTO user_roles (user_id, role_id) VALUES ('u-acc', 'role-accountant');
INSERT INTO user_roles (user_id, role_id) VALUES ('u-dir', 'role-director');
INSERT INTO user_roles (user_id, role_id) VALUES ('u-aud', 'role-auditor');

-- ---- fiscal year, school, document settings
INSERT INTO fiscal_years (id, year_be, start_date, end_date) VALUES ('fy-2570', 2570, '2026-10-01', '2027-09-30');
INSERT INTO school_settings (id, school_name, address_line, area_line, dept_line, memo_to_default, show_logo, memo_signer_role) VALUES
  (1, 'โรงเรียนบ้านไร่', 'อำเภอดอยเต่า จังหวัดเชียงใหม่', 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาเชียงใหม่ เขต 5',
      'โรงเรียนบ้านไร่ อำเภอดอยเต่า จังหวัดเชียงใหม่ สพป.เชียงใหม่ เขต 5', 'ผู้อำนวยการโรงเรียนบ้านไร่', 1, 'fin');
INSERT INTO document_signers (role_key, full_name, position) VALUES
  ('fin', '', 'เจ้าหน้าที่การเงิน'), ('acc', '', 'เจ้าหน้าที่บัญชี'), ('dir', '', 'ผู้อำนวยการโรงเรียนบ้านไร่');

-- ---- funds, projects, bank accounts (placeholder fund type: the school must confirm the real ones)
INSERT INTO fund_types (id, code, name) VALUES ('ft-sample', 'SAMPLE', 'ประเภทเงิน (ตัวอย่าง รอโรงเรียนยืนยัน)');
INSERT INTO fund_sources (id, fund_type_id, source_name, color) VALUES
  ('f1', 'ft-sample', 'เงินอุดหนุนรายหัว', '#0A4FCF'),
  ('f2', 'ft-sample', 'เงินอาหารกลางวัน', '#C2570C'),
  ('f3', 'ft-sample', 'เงินรายได้สถานศึกษา', '#7E22CE'),
  ('f4', 'ft-sample', 'เงินปัจจัยพื้นฐานนักเรียนยากจน', '#0891B2');
INSERT INTO projects (id, fiscal_year_id, fund_source_id, project_code, project_name, budget_amount_satang) VALUES
  ('p1', 'fy-2570', 'f1', 'P01', 'โครงการพัฒนาคุณภาพการเรียนการสอน', 12000000),
  ('p2', 'fy-2570', 'f2', 'P02', 'โครงการอาหารกลางวัน', 18000000),
  ('p3', 'fy-2570', 'f3', 'P03', 'โครงการปรับปรุงอาคารและกิจกรรมนักเรียน', 6000000),
  ('p4', 'fy-2570', 'f4', 'P04', 'โครงการช่วยเหลือนักเรียนยากจน', 4000000);
INSERT INTO bank_accounts (id, fund_source_id, account_name) VALUES
  ('b1', 'f1', 'บัญชีเงินอุดหนุนรายหัว (ตัวอย่าง)'), ('b2', 'f2', 'บัญชีเงินอาหารกลางวัน (ตัวอย่าง)'),
  ('b3', 'f3', 'บัญชีเงินรายได้สถานศึกษา (ตัวอย่าง)'), ('b4', 'f4', 'บัญชีเงินนักเรียนยากจน (ตัวอย่าง)');
-- numbering placeholders (prefix format to be confirmed by the school); last_no matches the sample receipts/vouchers below
INSERT INTO document_sequences (id, fiscal_year_id, doc_type, prefix, last_no) VALUES
  ('seq-rc-2570', 'fy-2570', 'receipt', 'ร.70/', 4), ('seq-pv-2570', 'fy-2570', 'voucher', 'จ.70/', 3);

-- ---- opening balances (ยอดยกมา) as ledger entries

INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-open-f1', 'fy-2570', 'f1', '2026-10-01', 8500000, 'opening', 'ยกมา', 'ยอดยกมา (ข้อมูลตัวอย่าง)', 'seed-open-f1', 'u-dir', '2026-10-01T01:00:00.000Z');
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-open-f2', 'fy-2570', 'f2', '2026-10-01', 4200000, 'opening', 'ยกมา', 'ยอดยกมา (ข้อมูลตัวอย่าง)', 'seed-open-f2', 'u-dir', '2026-10-01T01:00:00.000Z');
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-open-f3', 'fy-2570', 'f3', '2026-10-01', 12000000, 'opening', 'ยกมา', 'ยอดยกมา (ข้อมูลตัวอย่าง)', 'seed-open-f3', 'u-dir', '2026-10-01T01:00:00.000Z');
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-open-f4', 'fy-2570', 'f4', '2026-10-01', 1800000, 'opening', 'ยกมา', 'ยอดยกมา (ข้อมูลตัวอย่าง)', 'seed-open-f4', 'u-dir', '2026-10-01T01:00:00.000Z');

-- ---- income
INSERT INTO income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('inc-0001', 'fy-2570', 'f1', '2026-10-15', 'สพป.เชียงใหม่ เขต 5', 'เงินอุดหนุนรายหัว งวดที่ 1', 31000000, 'โอน', 'u-fin', '2026-10-15T02:00:00.000Z');
UPDATE income_transactions SET status = 'posted', receipt_number = 'ร.70/0001', posted_by = 'u-acc', posted_at = '2026-10-15T03:00:00.000Z', post_idempotency_key = 'seed-post-inc-0001', updated_by = 'u-acc', updated_at = '2026-10-15T03:00:00.000Z', version = version + 1 WHERE id = 'inc-0001';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-inc-0001', 'fy-2570', 'f1', '2026-10-15', 31000000, 'income', 'income', 'inc-0001', 'ร.70/0001', 'เงินอุดหนุนรายหัว งวดที่ 1', 'seed-post-inc-0001', 'u-acc', '2026-10-15T03:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-001', 'income', 'inc-0001', 'confirm', 'draft', 'posted', 'u-acc', NULL, '2026-10-15T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-001', 'u-acc', 'income.confirm', 'income', 'inc-0001', '{"status": "draft"}', '{"status": "posted"}', NULL, '2026-10-15T03:00:00.000Z');
INSERT INTO income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('inc-0002', 'fy-2570', 'f2', '2026-10-20', 'สพป.เชียงใหม่ เขต 5', 'เงินอาหารกลางวัน งวดที่ 1', 18600000, 'โอน', 'u-fin', '2026-10-20T02:00:00.000Z');
UPDATE income_transactions SET status = 'posted', receipt_number = 'ร.70/0002', posted_by = 'u-acc', posted_at = '2026-10-20T03:00:00.000Z', post_idempotency_key = 'seed-post-inc-0002', updated_by = 'u-acc', updated_at = '2026-10-20T03:00:00.000Z', version = version + 1 WHERE id = 'inc-0002';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-inc-0002', 'fy-2570', 'f2', '2026-10-20', 18600000, 'income', 'income', 'inc-0002', 'ร.70/0002', 'เงินอาหารกลางวัน งวดที่ 1', 'seed-post-inc-0002', 'u-acc', '2026-10-20T03:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-002', 'income', 'inc-0002', 'confirm', 'draft', 'posted', 'u-acc', NULL, '2026-10-20T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-002', 'u-acc', 'income.confirm', 'income', 'inc-0002', '{"status": "draft"}', '{"status": "posted"}', NULL, '2026-10-20T03:00:00.000Z');
INSERT INTO income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('inc-0003', 'fy-2570', 'f3', '2026-11-03', 'ผู้ปกครอง', 'รายได้สถานศึกษา', 2450000, 'โอน', 'u-fin', '2026-11-03T02:00:00.000Z');
UPDATE income_transactions SET status = 'posted', receipt_number = 'ร.70/0003', posted_by = 'u-acc', posted_at = '2026-11-03T03:00:00.000Z', post_idempotency_key = 'seed-post-inc-0003', updated_by = 'u-acc', updated_at = '2026-11-03T03:00:00.000Z', version = version + 1 WHERE id = 'inc-0003';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-inc-0003', 'fy-2570', 'f3', '2026-11-03', 2450000, 'income', 'income', 'inc-0003', 'ร.70/0003', 'รายได้สถานศึกษา', 'seed-post-inc-0003', 'u-acc', '2026-11-03T03:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-003', 'income', 'inc-0003', 'confirm', 'draft', 'posted', 'u-acc', NULL, '2026-11-03T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-003', 'u-acc', 'income.confirm', 'income', 'inc-0003', '{"status": "draft"}', '{"status": "posted"}', NULL, '2026-11-03T03:00:00.000Z');
INSERT INTO income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('inc-0004', 'fy-2570', 'f4', '2026-11-05', 'สพป.เชียงใหม่ เขต 5', 'ทุนนักเรียนยากจน', 3600000, 'โอน', 'u-fin', '2026-11-05T02:00:00.000Z');
UPDATE income_transactions SET status = 'posted', receipt_number = 'ร.70/0004', posted_by = 'u-acc', posted_at = '2026-11-05T03:00:00.000Z', post_idempotency_key = 'seed-post-inc-0004', updated_by = 'u-acc', updated_at = '2026-11-05T03:00:00.000Z', version = version + 1 WHERE id = 'inc-0004';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-inc-0004', 'fy-2570', 'f4', '2026-11-05', 3600000, 'income', 'income', 'inc-0004', 'ร.70/0004', 'ทุนนักเรียนยากจน', 'seed-post-inc-0004', 'u-acc', '2026-11-05T03:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-004', 'income', 'inc-0004', 'confirm', 'draft', 'posted', 'u-acc', NULL, '2026-11-05T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-004', 'u-acc', 'income.confirm', 'income', 'inc-0004', '{"status": "draft"}', '{"status": "posted"}', NULL, '2026-11-05T03:00:00.000Z');
INSERT INTO income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('inc-0005', 'fy-2570', 'f3', '2026-11-12', 'สหกรณ์โรงเรียน', 'ค่าเช่าร้านสหกรณ์', 320000, 'โอน', 'u-fin', '2026-11-12T02:00:00.000Z');

-- ---- expense (walked through the real status flow)
INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, project_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('exp-0001', 'fy-2570', 'f1', 'p1', '2026-10-28', 'ร้านเชียงใหม่ออฟฟิศ', 'ค่าวัสดุสำนักงาน', 1285000, 'โอน', 'u-fin', '2026-10-28T02:00:00.000Z');
UPDATE expense_transactions SET status = 'submitted', submitted_at = '2026-10-28T03:00:00.000Z', updated_by = 'u-fin', updated_at = '2026-10-28T03:00:00.000Z' WHERE id = 'exp-0001';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-005', 'expense', 'exp-0001', 'submit', 'draft', 'submitted', 'u-fin', NULL, '2026-10-28T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-005', 'u-fin', 'expense.submit', 'expense', 'exp-0001', '{"status": "draft"}', '{"status": "submitted"}', NULL, '2026-10-28T03:00:00.000Z');
UPDATE expense_transactions SET status = 'reviewed', reviewed_by = 'u-acc', reviewed_at = '2026-10-28T04:00:00.000Z', updated_by = 'u-acc', updated_at = '2026-10-28T04:00:00.000Z' WHERE id = 'exp-0001';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-006', 'expense', 'exp-0001', 'review', 'submitted', 'reviewed', 'u-acc', NULL, '2026-10-28T04:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-006', 'u-acc', 'expense.review', 'expense', 'exp-0001', '{"status": "submitted"}', '{"status": "reviewed"}', NULL, '2026-10-28T04:00:00.000Z');
UPDATE expense_transactions SET status = 'approved', approved_by = 'u-dir', approved_at = '2026-10-28T05:00:00.000Z', updated_by = 'u-dir', updated_at = '2026-10-28T05:00:00.000Z' WHERE id = 'exp-0001';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-007', 'expense', 'exp-0001', 'approve', 'reviewed', 'approved', 'u-dir', NULL, '2026-10-28T05:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-007', 'u-dir', 'expense.approve', 'expense', 'exp-0001', '{"status": "reviewed"}', '{"status": "approved"}', NULL, '2026-10-28T05:00:00.000Z');
UPDATE expense_transactions SET status = 'paid', voucher_number = 'จ.70/0001', paid_by = 'u-fin', paid_at = '2026-10-28T06:00:00.000Z', post_idempotency_key = 'seed-post-exp-0001', updated_by = 'u-fin', updated_at = '2026-10-28T06:00:00.000Z', version = version + 1 WHERE id = 'exp-0001';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-exp-0001', 'fy-2570', 'f1', '2026-10-28', -1285000, 'expense', 'expense', 'exp-0001', 'จ.70/0001', 'ค่าวัสดุสำนักงาน', 'seed-post-exp-0001', 'u-fin', '2026-10-28T06:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-008', 'expense', 'exp-0001', 'pay', 'approved', 'paid', 'u-fin', NULL, '2026-10-28T06:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-008', 'u-fin', 'expense.pay', 'expense', 'exp-0001', '{"status": "approved"}', '{"status": "paid"}', NULL, '2026-10-28T06:00:00.000Z');
INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, project_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('exp-0002', 'fy-2570', 'f2', 'p2', '2026-11-02', 'ตลาดสดบ้านไร่', 'ค่าวัตถุดิบอาหารกลางวัน', 5840000, 'โอน', 'u-fin', '2026-11-02T02:00:00.000Z');
UPDATE expense_transactions SET status = 'submitted', submitted_at = '2026-11-02T03:00:00.000Z', updated_by = 'u-fin', updated_at = '2026-11-02T03:00:00.000Z' WHERE id = 'exp-0002';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-009', 'expense', 'exp-0002', 'submit', 'draft', 'submitted', 'u-fin', NULL, '2026-11-02T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-009', 'u-fin', 'expense.submit', 'expense', 'exp-0002', '{"status": "draft"}', '{"status": "submitted"}', NULL, '2026-11-02T03:00:00.000Z');
UPDATE expense_transactions SET status = 'reviewed', reviewed_by = 'u-acc', reviewed_at = '2026-11-02T04:00:00.000Z', updated_by = 'u-acc', updated_at = '2026-11-02T04:00:00.000Z' WHERE id = 'exp-0002';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-010', 'expense', 'exp-0002', 'review', 'submitted', 'reviewed', 'u-acc', NULL, '2026-11-02T04:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-010', 'u-acc', 'expense.review', 'expense', 'exp-0002', '{"status": "submitted"}', '{"status": "reviewed"}', NULL, '2026-11-02T04:00:00.000Z');
UPDATE expense_transactions SET status = 'approved', approved_by = 'u-dir', approved_at = '2026-11-02T05:00:00.000Z', updated_by = 'u-dir', updated_at = '2026-11-02T05:00:00.000Z' WHERE id = 'exp-0002';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-011', 'expense', 'exp-0002', 'approve', 'reviewed', 'approved', 'u-dir', NULL, '2026-11-02T05:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-011', 'u-dir', 'expense.approve', 'expense', 'exp-0002', '{"status": "reviewed"}', '{"status": "approved"}', NULL, '2026-11-02T05:00:00.000Z');
UPDATE expense_transactions SET status = 'paid', voucher_number = 'จ.70/0002', paid_by = 'u-fin', paid_at = '2026-11-02T06:00:00.000Z', post_idempotency_key = 'seed-post-exp-0002', updated_by = 'u-fin', updated_at = '2026-11-02T06:00:00.000Z', version = version + 1 WHERE id = 'exp-0002';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-exp-0002', 'fy-2570', 'f2', '2026-11-02', -5840000, 'expense', 'expense', 'exp-0002', 'จ.70/0002', 'ค่าวัตถุดิบอาหารกลางวัน', 'seed-post-exp-0002', 'u-fin', '2026-11-02T06:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-012', 'expense', 'exp-0002', 'pay', 'approved', 'paid', 'u-fin', NULL, '2026-11-02T06:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-012', 'u-fin', 'expense.pay', 'expense', 'exp-0002', '{"status": "approved"}', '{"status": "paid"}', NULL, '2026-11-02T06:00:00.000Z');
INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, project_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('exp-0003', 'fy-2570', 'f3', 'p3', '2026-11-07', 'ช่างเชียงใหม่', 'ค่าซ่อมบำรุงอาคาร', 2130000, 'โอน', 'u-fin', '2026-11-07T02:00:00.000Z');
UPDATE expense_transactions SET status = 'submitted', submitted_at = '2026-11-07T03:00:00.000Z', updated_by = 'u-fin', updated_at = '2026-11-07T03:00:00.000Z' WHERE id = 'exp-0003';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-013', 'expense', 'exp-0003', 'submit', 'draft', 'submitted', 'u-fin', NULL, '2026-11-07T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-013', 'u-fin', 'expense.submit', 'expense', 'exp-0003', '{"status": "draft"}', '{"status": "submitted"}', NULL, '2026-11-07T03:00:00.000Z');
UPDATE expense_transactions SET status = 'reviewed', reviewed_by = 'u-acc', reviewed_at = '2026-11-07T04:00:00.000Z', updated_by = 'u-acc', updated_at = '2026-11-07T04:00:00.000Z' WHERE id = 'exp-0003';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-014', 'expense', 'exp-0003', 'review', 'submitted', 'reviewed', 'u-acc', NULL, '2026-11-07T04:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-014', 'u-acc', 'expense.review', 'expense', 'exp-0003', '{"status": "submitted"}', '{"status": "reviewed"}', NULL, '2026-11-07T04:00:00.000Z');
UPDATE expense_transactions SET status = 'approved', approved_by = 'u-dir', approved_at = '2026-11-07T05:00:00.000Z', updated_by = 'u-dir', updated_at = '2026-11-07T05:00:00.000Z' WHERE id = 'exp-0003';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-015', 'expense', 'exp-0003', 'approve', 'reviewed', 'approved', 'u-dir', NULL, '2026-11-07T05:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-015', 'u-dir', 'expense.approve', 'expense', 'exp-0003', '{"status": "reviewed"}', '{"status": "approved"}', NULL, '2026-11-07T05:00:00.000Z');
UPDATE expense_transactions SET status = 'paid', voucher_number = 'จ.70/0003', paid_by = 'u-fin', paid_at = '2026-11-07T06:00:00.000Z', post_idempotency_key = 'seed-post-exp-0003', updated_by = 'u-fin', updated_at = '2026-11-07T06:00:00.000Z', version = version + 1 WHERE id = 'exp-0003';
INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at) VALUES ('led-exp-0003', 'fy-2570', 'f3', '2026-11-07', -2130000, 'expense', 'expense', 'exp-0003', 'จ.70/0003', 'ค่าซ่อมบำรุงอาคาร', 'seed-post-exp-0003', 'u-fin', '2026-11-07T06:00:00.000Z');
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-016', 'expense', 'exp-0003', 'pay', 'approved', 'paid', 'u-fin', NULL, '2026-11-07T06:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-016', 'u-fin', 'expense.pay', 'expense', 'exp-0003', '{"status": "approved"}', '{"status": "paid"}', NULL, '2026-11-07T06:00:00.000Z');
INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, project_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('exp-0004', 'fy-2570', 'f1', NULL, '2026-11-10', 'การไฟฟ้าส่วนภูมิภาค', 'ค่าไฟฟ้า', 642000, 'โอน', 'u-fin', '2026-11-10T02:00:00.000Z');
UPDATE expense_transactions SET status = 'submitted', submitted_at = '2026-11-10T03:00:00.000Z', updated_by = 'u-fin', updated_at = '2026-11-10T03:00:00.000Z' WHERE id = 'exp-0004';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-017', 'expense', 'exp-0004', 'submit', 'draft', 'submitted', 'u-fin', NULL, '2026-11-10T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-017', 'u-fin', 'expense.submit', 'expense', 'exp-0004', '{"status": "draft"}', '{"status": "submitted"}', NULL, '2026-11-10T03:00:00.000Z');
UPDATE expense_transactions SET status = 'reviewed', reviewed_by = 'u-acc', reviewed_at = '2026-11-10T04:00:00.000Z', updated_by = 'u-acc', updated_at = '2026-11-10T04:00:00.000Z' WHERE id = 'exp-0004';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-018', 'expense', 'exp-0004', 'review', 'submitted', 'reviewed', 'u-acc', NULL, '2026-11-10T04:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-018', 'u-acc', 'expense.review', 'expense', 'exp-0004', '{"status": "submitted"}', '{"status": "reviewed"}', NULL, '2026-11-10T04:00:00.000Z');
UPDATE expense_transactions SET status = 'approved', approved_by = 'u-dir', approved_at = '2026-11-10T05:00:00.000Z', updated_by = 'u-dir', updated_at = '2026-11-10T05:00:00.000Z' WHERE id = 'exp-0004';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-019', 'expense', 'exp-0004', 'approve', 'reviewed', 'approved', 'u-dir', NULL, '2026-11-10T05:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-019', 'u-dir', 'expense.approve', 'expense', 'exp-0004', '{"status": "reviewed"}', '{"status": "approved"}', NULL, '2026-11-10T05:00:00.000Z');
INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, project_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('exp-0005', 'fy-2570', 'f1', 'p1', '2026-11-11', 'ร้านหนังสือ', 'ค่าหนังสือเรียนเสริม', 2800000, 'โอน', 'u-fin', '2026-11-11T02:00:00.000Z');
UPDATE expense_transactions SET status = 'submitted', submitted_at = '2026-11-11T03:00:00.000Z', updated_by = 'u-fin', updated_at = '2026-11-11T03:00:00.000Z' WHERE id = 'exp-0005';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-020', 'expense', 'exp-0005', 'submit', 'draft', 'submitted', 'u-fin', NULL, '2026-11-11T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-020', 'u-fin', 'expense.submit', 'expense', 'exp-0005', '{"status": "draft"}', '{"status": "submitted"}', NULL, '2026-11-11T03:00:00.000Z');
UPDATE expense_transactions SET status = 'reviewed', reviewed_by = 'u-acc', reviewed_at = '2026-11-11T04:00:00.000Z', updated_by = 'u-acc', updated_at = '2026-11-11T04:00:00.000Z' WHERE id = 'exp-0005';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-021', 'expense', 'exp-0005', 'review', 'submitted', 'reviewed', 'u-acc', NULL, '2026-11-11T04:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-021', 'u-acc', 'expense.review', 'expense', 'exp-0005', '{"status": "submitted"}', '{"status": "reviewed"}', NULL, '2026-11-11T04:00:00.000Z');
INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, project_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at) VALUES ('exp-0006', 'fy-2570', 'f3', 'p3', '2026-11-12', 'ร้านปาร์ตี้', 'ค่าจัดกิจกรรมวันเด็ก', 1500000, 'โอน', 'u-fin', '2026-11-12T02:00:00.000Z');
UPDATE expense_transactions SET status = 'submitted', submitted_at = '2026-11-12T03:00:00.000Z', updated_by = 'u-fin', updated_at = '2026-11-12T03:00:00.000Z' WHERE id = 'exp-0006';
INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) VALUES ('ev-seed-022', 'expense', 'exp-0006', 'submit', 'draft', 'submitted', 'u-fin', NULL, '2026-11-12T03:00:00.000Z');
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) VALUES ('aud-seed-022', 'u-fin', 'expense.submit', 'expense', 'exp-0006', '{"status": "draft"}', '{"status": "submitted"}', NULL, '2026-11-12T03:00:00.000Z');

INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, created_at) VALUES ('aud-seed-000', 'u-admin', 'seed.dev', 'system', 'dev-seed', '{"note":"development sample data"}', '2026-10-01T00:30:00.000Z');
