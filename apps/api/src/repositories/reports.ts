import { stmt } from './db.ts';
import type { Kind } from '../types.ts';

export async function fundSummary(db: D1Database) {
  const r = await db.prepare('SELECT * FROM v_fund_summary ORDER BY source_name').all();
  return r.results;
}

const LIST_COLS: Record<Kind, string> = {
  income:
    'id, fund_source_id, receipt_number AS document_number, transaction_date, payer_name AS party, description, amount_satang, payment_method, status, created_by',
  expense:
    'id, fund_source_id, project_id, voucher_number AS document_number, transaction_date, payee_name AS party, description, amount_satang, payment_method, status, created_by',
};
const TABLE: Record<Kind, string> = { income: 'income_transactions', expense: 'expense_transactions' };
const STATUSES = ['draft', 'submitted', 'reviewed', 'approved', 'paid', 'posted', 'rejected', 'cancelled', 'reversed'];

export async function listTransactions(db: D1Database, kind: Kind, status: string | null, limit = 200) {
  const where = status && STATUSES.includes(status) ? 'WHERE status = ?1' : '';
  const sql = `SELECT ${LIST_COLS[kind]} FROM ${TABLE[kind]} ${where} ORDER BY transaction_date DESC, id DESC LIMIT ${Math.min(Math.max(limit, 1), 500)}`;
  const r = await (where ? stmt(db, sql, [status]) : db.prepare(sql)).all();
  return r.results;
}

export async function integrityIssues(db: D1Database) {
  const r = await db.prepare('SELECT issue, entity_id FROM v_integrity_issues').all();
  return r.results;
}

export async function auditLogs(db: D1Database, limit = 100) {
  const r = await db
    .prepare(`SELECT id, user_id, action, entity_type, entity_id, reason, created_at FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ${Math.min(Math.max(limit, 1), 500)}`)
    .all();
  return r.results;
}
