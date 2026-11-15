import { HttpError } from '../http.ts';
import { requirePerm } from '../middleware/auth.ts';
import type { Session } from '../middleware/auth.ts';
import { stmt } from '../repositories/db.ts';
import { bahtToSatang, bangkokDate, isIsoDate, text } from '../validators/money.ts';
import type { Kind } from '../types.ts';

// Table and column names below are fixed constants, never user input.
const TABLE: Record<Kind, string> = { income: 'income_transactions', expense: 'expense_transactions' };
const SEQ: Record<Kind, { type: string; col: string; party: string }> = {
  income: { type: 'receipt', col: 'receipt_number', party: 'payer_name' },
  expense: { type: 'voucher', col: 'voucher_number', party: 'payee_name' },
};
const IDEM = /^[A-Za-z0-9_-]{8,100}$/;

interface Step {
  perm: string | null; // null: decided from the current status (expense rejection)
  from: string[];
  to: string;
  by?: string;
  at?: string;
  reason?: boolean;
}
const STEPS: Record<Kind, Record<string, Step>> = {
  expense: {
    submit: { perm: 'create', from: ['draft'], to: 'submitted' },
    review: { perm: 'review', from: ['submitted'], to: 'reviewed', by: 'reviewed_by', at: 'reviewed_at' },
    approve: { perm: 'approve', from: ['reviewed'], to: 'approved', by: 'approved_by', at: 'approved_at' },
    reject: { perm: null, from: ['submitted', 'reviewed'], to: 'rejected', reason: true },
  },
  income: {
    submit: { perm: 'create', from: ['draft'], to: 'submitted' },
    reject: { perm: 'confirm', from: ['draft', 'submitted'], to: 'rejected', reason: true },
  },
};

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const iso = (d: Date) => d.toISOString();

export function idempotencyKey(v: string | null): string {
  if (!v || !IDEM.test(v)) throw new HttpError(400, 'idempotency_key_required');
  return v;
}

async function current(db: D1Database, kind: Kind, id: string) {
  const row = await stmt(db, `SELECT status, ${SEQ[kind].col} AS number, post_idempotency_key AS pkey, reversal_idempotency_key AS rkey FROM ${TABLE[kind]} WHERE id = ?1`, [id]).first<{
    status: string;
    number: string | null;
    pkey: string | null;
    rkey: string | null;
  }>();
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

/** Create a draft. The fiscal year is derived from the date; the amount is parsed from a decimal string. */
export async function createTransaction(db: D1Database, kind: Kind, s: Session, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'create');
  const fund = text(body.fundSourceId, 'fund', 1, 60);
  const date = body.transactionDate;
  if (!isIsoDate(date)) throw new HttpError(422, 'invalid_date');
  const party = text(body.partyName, 'party', 1, 120);
  const description = text(body.description, 'description', 1, 300);
  const method = text(body.paymentMethod, 'payment_method', 1, 40);
  const amount = bahtToSatang(body.amount);
  const project = kind === 'expense' && body.projectId != null && body.projectId !== '' ? text(body.projectId, 'project', 1, 60) : null;
  const activity = kind === 'expense' && body.activityId != null && body.activityId !== '' ? text(body.activityId, 'activity', 1, 60) : null;
  const fy = await stmt(db, 'SELECT id FROM fiscal_years WHERE ?1 BETWEEN start_date AND end_date', [date]).first<{ id: string }>();
  if (!fy) throw new HttpError(422, 'no_fiscal_year_for_date');
  const id = newId(kind === 'income' ? 'inc' : 'exp');
  const t = iso(now);
  const cols = kind === 'income' ? 'id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by, created_at'
    : 'id, fiscal_year_id, fund_source_id, transaction_date, payee_name, description, amount_satang, payment_method, created_by, created_at, project_id';
  const vals = kind === 'income' ? '?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10' : '?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11';
  const params: unknown[] = [id, fy.id, fund, date, party, description, amount, method, s.userId, t];
  if (kind === 'expense') params.push(project);
  // activity_id exists only after migration 0011, so it is written only when an activity was chosen.
  if (activity) params.push(activity);
  await db.batch([
    stmt(db, `INSERT INTO ${TABLE[kind]} (${cols}${activity ? ', activity_id' : ''}) VALUES (${vals}${activity ? ', ?12' : ''})`, params),
    stmt(db, `INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, created_at) VALUES (?1, ?2, ?3, 'create', NULL, 'draft', ?4, ?5)`, [newId('ev'), kind, id, s.userId, t]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`, [newId('aud'), s.userId, `${kind}.create`, kind, id, JSON.stringify({ status: 'draft', amount_satang: amount }), t]),
  ]);
  return { id, status: 'draft', amountSatang: amount };
}

/** submit / review / approve / reject. Who may do what is checked here; separation of duties is enforced by the database. */
export async function advance(db: D1Database, kind: Kind, s: Session, id: string, action: string, reasonIn: unknown, now: Date) {
  const step = STEPS[kind][action];
  if (!step) throw new HttpError(404, 'unknown_action');
  const row = await current(db, kind, id);
  if (!step.from.includes(row.status)) throw new HttpError(409, 'invalid_state');
  requirePerm(s, step.perm ?? (row.status === 'submitted' ? 'review' : 'approve'));
  const reason = step.reason ? text(reasonIn, 'reason', 3, 200) : null;
  const t = iso(now);
  const sets = ['status = ?3', 'updated_by = ?2', 'updated_at = ?4', 'version = version + 1'];
  const params: unknown[] = [id, s.userId, step.to, t];
  if (step.by && step.at) sets.push(`${step.by} = ?2`, `${step.at} = ?4`);
  if (action === 'submit') sets.push('submitted_at = ?4');
  if (step.reason) { sets.push('rejected_by = ?2', 'rejected_at = ?4', 'rejection_reason = ?5'); params.push(reason); }
  const fromIdx = params.length + 1;
  params.push(row.status);
  const upd = stmt(db, `UPDATE ${TABLE[kind]} SET ${sets.join(', ')} WHERE id = ?1 AND status = ?${fromIdx}`, params);
  const evId = newId('ev'), audId = newId('aud');
  const guard = `FROM ${TABLE[kind]} t WHERE t.id = ?1 AND t.status = ?3 AND t.updated_by = ?2 AND t.updated_at = ?4`;
  const res = await db.batch([
    upd,
    stmt(db, `INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, created_at) SELECT ?5, ?6, t.id, ?7, ?8, ?3, ?2, ?9, ?4 ${guard}`, [id, s.userId, step.to, t, evId, kind, action, row.status, reason]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at) SELECT ?5, ?2, ?6, ?7, t.id, ?8, ?9, ?10, ?4 ${guard}`, [id, s.userId, step.to, t, audId, `${kind}.${action}`, kind, JSON.stringify({ status: row.status }), JSON.stringify({ status: step.to }), reason]),
  ]);
  if (res[0].meta.changes !== 1) throw new HttpError(409, 'state_changed');
  return { id, status: step.to };
}

/**
 * Post a transaction: income 'confirm' (receipt) or expense 'pay' (voucher).
 * One D1 batch = one transaction: status change + document number + ledger row + event + audit.
 * The Idempotency-Key makes a retry return the first result instead of posting twice.
 */
export async function post(db: D1Database, kind: Kind, s: Session, id: string, key: string, now: Date) {
  requirePerm(s, kind === 'income' ? 'confirm' : 'pay');
  const before = await current(db, kind, id);
  const posted = kind === 'income' ? 'posted' : 'paid';
  const fromList = kind === 'income' ? `('draft', 'submitted')` : `('approved')`;
  const { type, col } = SEQ[kind];
  const t = iso(now);
  const T = TABLE[kind];
  const who = kind === 'income' ? 'posted_by = ?2, posted_at = ?4' : 'paid_by = ?2, paid_at = ?4';
  const sign = kind === 'income' ? '' : '-';
  const res = await db.batch([
    stmt(db, `UPDATE ${T} SET status = '${posted}', ${who}, post_idempotency_key = ?3, updated_by = ?2, updated_at = ?4, version = version + 1,
        ${col} = (SELECT q.prefix || printf('%04d', q.last_no + 1) FROM document_sequences q WHERE q.fiscal_year_id = ${T}.fiscal_year_id AND q.doc_type = '${type}')
      WHERE id = ?1 AND status IN ${fromList}`, [id, s.userId, key, t]),
    // bump the sequence only when THIS request did the posting (not on a replay)
    stmt(db, `UPDATE document_sequences SET last_no = last_no + 1
      WHERE doc_type = '${type}' AND fiscal_year_id = (SELECT fiscal_year_id FROM ${T} WHERE id = ?1)
        AND EXISTS (SELECT 1 FROM ${T} WHERE id = ?1 AND status = '${posted}' AND post_idempotency_key = ?2)
        AND NOT EXISTS (SELECT 1 FROM ledger_entries WHERE idempotency_key = ?2)`, [id, key]),
    stmt(db, `INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, ref_no, description, idempotency_key, created_by, created_at)
      SELECT 'led-' || ?3, e.fiscal_year_id, e.fund_source_id, e.transaction_date, ${sign}e.amount_satang, '${kind}', '${kind}', e.id, e.${col}, e.description, ?3, ?2, ?4
        FROM ${T} e WHERE e.id = ?1 AND e.status = '${posted}' AND e.post_idempotency_key = ?3
      ON CONFLICT DO NOTHING`, [id, s.userId, key, t]),
    stmt(db, `INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, idempotency_key, created_at)
      SELECT 'ev-' || ?3, '${kind}', e.id, '${kind === 'income' ? 'confirm' : 'pay'}', ?5, '${posted}', ?2, ?3, ?4
        FROM ${T} e WHERE e.id = ?1 AND e.status = '${posted}' AND e.post_idempotency_key = ?3
      ON CONFLICT DO NOTHING`, [id, s.userId, key, t, before.status]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, created_at)
      SELECT 'aud-' || ?3, ?2, '${kind}.${kind === 'income' ? 'confirm' : 'pay'}', '${kind}', e.id, ?5,
             json_object('status', '${posted}', 'number', e.${col}, 'amount_satang', e.amount_satang), ?4
        FROM ${T} e WHERE e.id = ?1 AND e.status = '${posted}' AND e.post_idempotency_key = ?3
      ON CONFLICT DO NOTHING`, [id, s.userId, key, t, JSON.stringify({ status: before.status })]),
  ]);
  const after = await current(db, kind, id);
  if (after.status === posted && after.pkey === key) return { id, status: posted, number: after.number, replayed: res[0].meta.changes === 0 };
  if (after.status === posted || after.status === 'reversed') throw new HttpError(409, 'already_posted');
  throw new HttpError(409, 'invalid_state');
}

/** Reverse a posted transaction: the original rows stay; a mirror ledger entry is added. A reason is mandatory. */
export async function reverse(db: D1Database, kind: Kind, s: Session, id: string, reasonIn: unknown, key: string, now: Date) {
  requirePerm(s, 'reverse');
  const reason = text(reasonIn, 'reason', 3, 200);
  const before = await current(db, kind, id);
  const posted = kind === 'income' ? 'posted' : 'paid';
  const { col } = SEQ[kind];
  const T = TABLE[kind];
  const t = iso(now);
  const entryDate = bangkokDate(now);
  const sign = kind === 'income' ? '-' : '';
  const done = `e.id = ?1 AND e.status = 'reversed' AND e.reversal_idempotency_key = ?3`;
  const res = await db.batch([
    stmt(db, `UPDATE ${T} SET status = 'reversed', reversed_by = ?2, reversed_at = ?4, reversal_reason = ?5, reversal_idempotency_key = ?3, updated_by = ?2, updated_at = ?4, version = version + 1
      WHERE id = ?1 AND status = '${posted}'`, [id, s.userId, key, t, reason]),
    stmt(db, `INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, reverses_entry_id, ref_no, description, idempotency_key, created_by, created_at)
      SELECT 'led-' || ?3, e.fiscal_year_id, e.fund_source_id, ?5, ${sign}e.amount_satang, 'reversal', '${kind}', e.id,
             (SELECT l.id FROM ledger_entries l WHERE l.kind = '${kind}' AND l.source_id = e.id), 'กลับ ' || e.${col}, 'กลับรายการ: ' || e.description, ?3, ?2, ?4
        FROM ${T} e WHERE ${done}
      ON CONFLICT DO NOTHING`, [id, s.userId, key, t, entryDate]),
    stmt(db, `INSERT INTO transaction_events (id, entity_type, entity_id, action, from_status, to_status, actor_id, reason, idempotency_key, created_at)
      SELECT 'ev-' || ?3, '${kind}', e.id, 'reverse', '${posted}', 'reversed', ?2, ?5, ?3, ?4 FROM ${T} e WHERE ${done}
      ON CONFLICT DO NOTHING`, [id, s.userId, key, t, reason]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, reason, created_at)
      SELECT 'aud-' || ?3, ?2, '${kind}.reverse', '${kind}', e.id, ?6, ?7, ?5, ?4 FROM ${T} e WHERE ${done}
      ON CONFLICT DO NOTHING`, [id, s.userId, key, t, reason, JSON.stringify({ status: posted }), JSON.stringify({ status: 'reversed' })]),
  ]);
  const after = await current(db, kind, id);
  if (after.status === 'reversed' && after.rkey === key) return { id, status: 'reversed', replayed: res[0].meta.changes === 0 };
  if (after.status === 'reversed') throw new HttpError(409, 'already_reversed');
  throw new HttpError(409, before.status === posted ? 'state_changed' : 'invalid_state');
}
