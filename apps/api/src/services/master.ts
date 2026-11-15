import { HttpError } from '../http.ts';
import { requirePerm } from '../middleware/auth.ts';
import type { Session } from '../middleware/auth.ts';
import { stmt } from '../repositories/db.ts';
import type { Env } from '../types.ts';
import { bahtToSatang, bahtToSatangOrZero, bangkokDate, text } from '../validators/money.ts';
import { me } from './auth.ts';

const id = (p: string) => `${p}-${crypto.randomUUID()}`;
const COLORS = ['#0A4FCF', '#C2570C', '#7E22CE', '#0891B2', '#15803D', '#B42318', '#4338CA', '#BE185D'];
const SIGNERS = ['fin', 'acc', 'dir'] as const;
const audit = (db: D1Database, s: Session, action: string, type: string, target: string, t: string, detail?: unknown) =>
  stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`, [id('aud'), s.userId, action, type, target, detail === undefined ? null : JSON.stringify(detail), t]);

const ACTION_TH: Record<string, string> = {
  'income.create': 'สร้างรายการรับ (ร่าง)', 'income.submit': 'ส่งรายการรับ', 'income.confirm': 'ยืนยันรับเงิน', 'income.reject': 'ไม่อนุมัติรายการรับ', 'income.reverse': 'กลับรายการรับ',
  'expense.create': 'สร้างคำขอเบิก (ร่าง)', 'expense.submit': 'ส่งตรวจ', 'expense.review': 'ตรวจผ่าน', 'expense.approve': 'อนุมัติ', 'expense.reject': 'ไม่อนุมัติ', 'expense.pay': 'บันทึกจ่าย', 'expense.reverse': 'กลับรายการจ่าย',
  'auth.login': 'เข้าสู่ระบบ', 'auth.logout': 'ออกจากระบบ', 'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ', 'auth.locked': 'บัญชีถูกล็อกชั่วคราว', 'auth.password_changed': 'เปลี่ยนรหัสผ่าน',
  'user.create': 'เพิ่มผู้ใช้', 'user.update': 'แก้ไขบัญชีผู้ใช้', 'user.delete': 'ลบบัญชีผู้ใช้', 'user.enable': 'เปิดใช้บัญชี', 'user.disable': 'ปิดบัญชี', 'user.reset_password': 'ตั้งรหัสผ่านใหม่ให้ผู้ใช้',
  'settings.update': 'แก้ไขตั้งค่าเอกสาร', 'settings.crest': 'เปลี่ยนตราครุฑ', 'settings.crest_delete': 'ลบตราครุฑ',
  'fund.create': 'เพิ่มแหล่งเงิน', 'fund.rename': 'แก้ชื่อแหล่งเงิน', 'fund.opening': 'แก้ยอดยกมา', 'fund.delete': 'ลบแหล่งเงิน', 'project.create': 'เพิ่มโครงการ', 'bank.reconcile': 'บันทึกยอดสมุดบัญชี',
  'fiscal_year.create': 'เปิดปีงบประมาณ', 'fiscal_year.close': 'ปิดปีงบประมาณ',
};

/** The open fiscal year that contains today, else the latest open one, else the latest. */
export async function currentYear(db: D1Database, now: Date) {
  const d = bangkokDate(now);
  type FY = { id: string; year_be: number; start_date: string; end_date: string; status: string };
  return (
    (await stmt(db, `SELECT id, year_be, start_date, end_date, status FROM fiscal_years WHERE status = 'open' AND ?1 BETWEEN start_date AND end_date`, [d]).first<FY>()) ??
    (await db.prepare(`SELECT id, year_be, start_date, end_date, status FROM fiscal_years ORDER BY (status = 'open') DESC, year_be DESC LIMIT 1`).first<FY>())
  );
}

/**
 * Everything the web app needs to draw its screens, in one read. Shapes follow the web app's own model.
 * Ledger rows dated before the current fiscal year are folded into one "brought forward" row per fund,
 * so balances stay cumulative while the screens show the current year.
 */
export async function state(db: D1Database, s: Session, now: Date) {
  requirePerm(s, 'read');
  const fy = await currentYear(db, now);
  const st = await db.prepare('SELECT * FROM school_settings WHERE id = 1').first<Record<string, any>>();
  const sg = (await db.prepare('SELECT role_key, full_name, position FROM document_signers').all<{ role_key: string; full_name: string; position: string }>()).results;
  const cfg = st
    ? { school: st.school_name, addr: st.address_line, area: st.area_line, dept: st.dept_line, to: st.memo_to_default, logo: st.show_logo === 1, mmBy: st.memo_signer_role, crest: st.crest_object_key ? String(st.crest_object_key).slice(-12) : null,
        sg: Object.fromEntries(SIGNERS.map((k) => { const r = sg.find((x) => x.role_key === k); return [k, { n: r?.full_name ?? '', p: r?.position ?? '' }]; })) }
    : null;
  const base = { me: me(s), fy: fy ? { id: fy.id, be: fy.year_be, s: fy.start_date, e: fy.end_date, status: fy.status } : null, cfg, hasSettings: !!st };
  if (!fy) return { ...base, funds: [], projects: [], banks: [], inc: [], exp: [], led: [], log: [] };
  const all = async (sql: string, p: unknown[] = []) => (await (p.length ? stmt(db, sql, p) : db.prepare(sql)).all<Record<string, any>>()).results;
  const funds = await all(`SELECT id, source_name AS name, color AS c FROM fund_sources WHERE is_active = 1 ORDER BY created_at, id`);
  const projects = await all(`SELECT id, fund_source_id AS fund, project_name AS name, budget_amount_satang AS bs FROM projects WHERE fiscal_year_id = ?1 ORDER BY project_code`, [fy.id]);
  const banks = await all(
    `SELECT b.id, b.fund_source_id AS fund, b.account_name AS name,
            (SELECT r.statement_balance_satang FROM bank_reconciliations r WHERE r.bank_account_id = b.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS stmt,
            (SELECT r.as_of_date FROM bank_reconciliations r WHERE r.bank_account_id = b.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS at
       FROM bank_accounts b WHERE b.is_active = 1 ORDER BY b.created_at, b.id`,
  );
  const inc = await all(
    `SELECT id, fund_source_id AS fund, transaction_date AS date, payer_name AS party, description AS "desc", amount_satang AS amt, payment_method AS method, status, created_by AS "by", receipt_number AS no
       FROM income_transactions WHERE fiscal_year_id = ?1 AND status <> 'cancelled' ORDER BY transaction_date DESC, id DESC LIMIT 3000`, [fy.id]);
  const exp = await all(
    `SELECT id, fund_source_id AS fund, transaction_date AS date, payee_name AS party, description AS "desc", amount_satang AS amt, payment_method AS method, COALESCE(project_id, '') AS proj, status, created_by AS "by", voucher_number AS no
       FROM expense_transactions WHERE fiscal_year_id = ?1 AND status <> 'cancelled' ORDER BY transaction_date DESC, id DESC LIMIT 3000`, [fy.id]);
  const bf = await all(`SELECT fund_source_id AS fund, SUM(amount_satang) AS amt FROM ledger_entries WHERE entry_date < ?1 AND fund_source_id IN (SELECT id FROM fund_sources WHERE is_active = 1) GROUP BY fund_source_id HAVING SUM(amount_satang) <> 0`, [fy.start_date]);
  const cur = await all(
    `SELECT id, entry_date AS date, fund_source_id AS fund, amount_satang AS amt, COALESCE(ref_no, '') AS ref, description AS "desc",
            CASE WHEN kind = 'opening' OR (kind = 'adjustment' AND ref_no = 'ปรับยอดยกมา') THEN 'open' WHEN source_type = 'income' THEN 'inc' WHEN source_type = 'expense' THEN 'exp' WHEN amount_satang >= 0 THEN 'inc' ELSE 'exp' END AS kind
       FROM ledger_entries WHERE entry_date >= ?1 AND fund_source_id IN (SELECT id FROM fund_sources WHERE is_active = 1) ORDER BY entry_date, created_at, id LIMIT 8000`, [fy.start_date]);
  const led = [...bf.map((r) => ({ id: 'bf-' + r.fund, date: fy.start_date, fund: r.fund, amt: r.amt, ref: 'ยกมา', desc: 'ยอดยกมาจากปีก่อน', kind: 'open' })), ...cur];
  const log = s.permissions.has('audit_read')
    ? (await all(
        `SELECT a.id, a.created_at AS at, COALESCE(u.full_name, 'ไม่ระบุ') AS u, a.action AS a, a.reason AS why,
                COALESCE(i.receipt_number, i.description, e.voucher_number, e.description, a.entity_id) AS ref
           FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN income_transactions i ON a.entity_type = 'income' AND i.id = a.entity_id
           LEFT JOIN expense_transactions e ON a.entity_type = 'expense' AND e.id = a.entity_id
          ORDER BY a.created_at DESC, a.id DESC LIMIT 300`,
      )).map((l) => ({ ...l, a: ACTION_TH[l.a] ?? l.a, why: l.why ?? '', ref: l.ref ?? '' }))
    : [];
  return { ...base, funds, projects, banks, inc, exp, led, log };
}

export async function saveSettings(db: D1Database, s: Session, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'docset');
  const v = { school: text(body.school, 'school', 1, 200), addr: text(body.addr, 'addr', 1, 200), area: text(body.area, 'area', 1, 200), dept: text(body.dept, 'dept', 1, 200), to: text(body.to, 'to', 1, 200) };
  const mmBy = SIGNERS.includes(body.mmBy as never) ? (body.mmBy as string) : 'fin';
  const sg = (body.sg && typeof body.sg === 'object' ? body.sg : {}) as Record<string, any>;
  const t = now.toISOString();
  const batch = [
    stmt(db, `INSERT INTO school_settings (id, school_name, address_line, area_line, dept_line, memo_to_default, show_logo, memo_signer_role, updated_at, updated_by)
              VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
              ON CONFLICT(id) DO UPDATE SET school_name = ?1, address_line = ?2, area_line = ?3, dept_line = ?4, memo_to_default = ?5, show_logo = ?6, memo_signer_role = ?7, updated_at = ?8, updated_by = ?9`,
      [v.school, v.addr, v.area, v.dept, v.to, body.logo === false ? 0 : 1, mmBy, t, s.userId]),
  ];
  for (const k of SIGNERS) {
    const r = sg[k] && typeof sg[k] === 'object' ? sg[k] : {};
    const n = typeof r.n === 'string' ? r.n.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    const p = typeof r.p === 'string' ? r.p.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    batch.push(stmt(db, `INSERT INTO document_signers (role_key, full_name, position, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5)
                         ON CONFLICT(role_key) DO UPDATE SET full_name = ?2, position = ?3, updated_at = ?4, updated_by = ?5`, [k, n, p, t, s.userId]));
  }
  batch.push(audit(db, s, 'settings.update', 'settings', '1', t));
  await db.batch(batch);
  return { ok: true };
}

export async function createFiscalYear(db: D1Database, s: Session, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'setup');
  const be = Number(body.yearBe);
  if (!Number.isInteger(be) || be < 2560 || be > 2650) throw new HttpError(422, 'invalid_year');
  const fid = `fy-${be}`, yy = String(be % 100).padStart(2, '0'), t = now.toISOString();
  // Thai government fiscal year: 1 October of the previous calendar year to 30 September. Confirm before production (docs/REGULATIONS_REGISTER.md).
  await db.batch([
    stmt(db, 'INSERT INTO fiscal_years (id, year_be, start_date, end_date) VALUES (?1, ?2, ?3, ?4)', [fid, be, `${be - 544}-10-01`, `${be - 543}-09-30`]),
    stmt(db, `INSERT INTO document_sequences (id, fiscal_year_id, doc_type, prefix, last_no) VALUES (?1, ?2, 'receipt', ?3, 0)`, [`seq-rc-${be}`, fid, `ร.${yy}/`]),
    stmt(db, `INSERT INTO document_sequences (id, fiscal_year_id, doc_type, prefix, last_no) VALUES (?1, ?2, 'voucher', ?3, 0)`, [`seq-pv-${be}`, fid, `จ.${yy}/`]),
    audit(db, s, 'fiscal_year.create', 'fiscal_year', fid, t),
  ]);
  return { id: fid, yearBe: be };
}

export async function closeFiscalYear(db: D1Database, s: Session, fid: string, now: Date) {
  requirePerm(s, 'setup');
  const t = now.toISOString();
  const open = await stmt(db, `SELECT (SELECT COUNT(*) FROM income_transactions WHERE fiscal_year_id = ?1 AND status IN ('draft', 'submitted')) +
                                      (SELECT COUNT(*) FROM expense_transactions WHERE fiscal_year_id = ?1 AND status IN ('draft', 'submitted', 'reviewed', 'approved')) AS n`, [fid]).first<{ n: number }>();
  if (open && open.n > 0) throw new HttpError(409, 'year_has_open_items');
  const r = await db.batch([
    stmt(db, `UPDATE fiscal_years SET status = 'closed', closed_at = ?2, closed_by = ?3 WHERE id = ?1 AND status = 'open'`, [fid, t, s.userId]),
    audit(db, s, 'fiscal_year.close', 'fiscal_year', fid, t),
  ]);
  if (r[0].meta.changes !== 1) throw new HttpError(409, 'invalid_state');
  return { id: fid, status: 'closed' };
}

export async function addFund(db: D1Database, s: Session, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'setup');
  const name = text(body.name, 'name', 1, 80);
  const opening = bahtToSatangOrZero(body.opening ?? '0');
  const fy = await currentYear(db, now);
  if (opening > 0 && (!fy || fy.status !== 'open')) throw new HttpError(409, 'no_open_fiscal_year');
  const n = (await db.prepare('SELECT COUNT(*) AS n FROM fund_sources').first<{ n: number }>())?.n ?? 0;
  const fid = id('f'), t = now.toISOString();
  const batch = [
    // Until the school confirms its fund types, new funds go under one neutral type.
    stmt(db, 'INSERT OR IGNORE INTO fund_types (id, code, name) VALUES (?1, ?2, ?3)', ['ft-general', 'GENERAL', 'ยังไม่จัดประเภท']),
    stmt(db, `INSERT INTO fund_sources (id, fund_type_id, source_name, color, created_at) VALUES (?1, 'ft-general', ?2, ?3, ?4)`, [fid, name, COLORS[n % COLORS.length], t]),
    stmt(db, `INSERT INTO bank_accounts (id, fund_source_id, account_name, created_at) VALUES (?1, ?2, ?3, ?4)`, [id('b'), fid, 'บัญชี' + name, t]),
  ];
  if (opening > 0) batch.push(stmt(db, `INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, ref_no, description, idempotency_key, created_by, created_at)
                                        VALUES (?1, ?2, ?3, ?4, ?5, 'opening', 'ยกมา', 'ยอดยกมา', ?6, ?7, ?8)`, [id('led'), fy!.id, fid, fy!.start_date, opening, 'open-' + fid, s.userId, t]));
  batch.push(audit(db, s, 'fund.create', 'fund', fid, t, { name, opening_satang: opening }));
  await db.batch(batch);
  return { id: fid };
}

export async function renameFund(db: D1Database, s: Session, fid: string, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'setup');
  const name = text(body.name, 'name', 1, 80);
  const r = await db.batch([stmt(db, 'UPDATE fund_sources SET source_name = ?2 WHERE id = ?1', [fid, name]), audit(db, s, 'fund.rename', 'fund', fid, now.toISOString(), { name })]);
  if (r[0].meta.changes !== 1) throw new HttpError(404, 'not_found');
  return { id: fid };
}

/** Opening balance changes are booked as ledger adjustments with this reference; the ledger itself is append-only. */
const OPEN_ADJ = 'ปรับยอดยกมา';

/**
 * How a fund is used. `used` counts everything except this year's opening balance (and its adjustments):
 * transactions, projects, bank reconciliations and any ledger row of another fiscal year.
 */
async function fundUsage(db: D1Database, fid: string, fyId: string | null) {
  return (await stmt(db, `SELECT
      (SELECT COUNT(*) FROM income_transactions WHERE fund_source_id = ?1)
    + (SELECT COUNT(*) FROM expense_transactions WHERE fund_source_id = ?1)
    + (SELECT COUNT(*) FROM projects WHERE fund_source_id = ?1)
    + (SELECT COUNT(*) FROM bank_reconciliations r JOIN bank_accounts b ON b.id = r.bank_account_id WHERE b.fund_source_id = ?1)
    + (SELECT COUNT(*) FROM ledger_entries WHERE fund_source_id = ?1
          AND NOT (fiscal_year_id IS ?2 AND (kind = 'opening' OR (kind = 'adjustment' AND ref_no = ?3)))) AS used,
      (SELECT COALESCE(SUM(amount_satang), 0) FROM ledger_entries WHERE fund_source_id = ?1
          AND fiscal_year_id IS ?2 AND (kind = 'opening' OR (kind = 'adjustment' AND ref_no = ?3))) AS opening,
      (SELECT COUNT(*) FROM ledger_entries WHERE fund_source_id = ?1) AS rows`, [fid, fyId, OPEN_ADJ]).first<{ used: number; opening: number; rows: number }>())!;
}

const openingAdjustment = (db: D1Database, s: Session, fy: { id: string; start_date: string }, fid: string, diff: number, why: string, t: string) =>
  stmt(db, `INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, ref_no, description, idempotency_key, created_by, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, 'adjustment', ?6, ?7, ?8, ?9, ?10)`, [id('led'), fy.id, fid, fy.start_date, diff, OPEN_ADJ, why, 'adj-' + crypto.randomUUID(), s.userId, t]);

/**
 * Edit a fund: name, and this year's opening balance. The opening balance can be changed while the fund has no
 * other use; after that only a system administrator (user_admin) may change it. Every change is in the audit log.
 */
export async function updateFund(db: D1Database, s: Session, fid: string, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'setup');
  const f = await stmt(db, 'SELECT source_name AS name FROM fund_sources WHERE id = ?1 AND is_active = 1', [fid]).first<{ name: string }>();
  if (!f) throw new HttpError(404, 'not_found');
  const name = text(body.name, 'name', 1, 80), t = now.toISOString();
  const batch: D1PreparedStatement[] = [];
  if (name !== f.name) batch.push(stmt(db, 'UPDATE fund_sources SET source_name = ?2 WHERE id = ?1', [fid, name]), audit(db, s, 'fund.rename', 'fund', fid, t, { from: f.name, name }));
  if (body.opening !== undefined && body.opening !== null && body.opening !== '') {
    const want = bahtToSatangOrZero(body.opening);
    const fy = await currentYear(db, now);
    if (!fy || fy.status !== 'open') throw new HttpError(409, 'no_open_fiscal_year');
    const u = await fundUsage(db, fid, fy.id);
    const diff = want - u.opening;
    if (diff !== 0) {
      if (u.used > 0 && !s.permissions.has('user_admin')) throw new HttpError(409, 'fund_in_use');
      batch.push(openingAdjustment(db, s, fy, fid, diff, 'ปรับยอดยกมา', t), audit(db, s, 'fund.opening', 'fund', fid, t, { from_satang: u.opening, to_satang: want }));
    }
  }
  if (batch.length) await db.batch(batch);
  return { id: fid, changed: batch.length > 0 };
}

/**
 * Delete a fund that has never been used. With no ledger rows at all it is removed outright; if it only has an
 * opening balance, that balance is brought to zero by an adjustment and the fund is archived (hidden, kept in
 * history), because the ledger is append-only. A fund with transactions, projects or reconciliations cannot go.
 */
export async function deleteFund(db: D1Database, s: Session, fid: string, now: Date) {
  requirePerm(s, 'setup');
  const f = await stmt(db, 'SELECT source_name AS name FROM fund_sources WHERE id = ?1 AND is_active = 1', [fid]).first<{ name: string }>();
  if (!f) throw new HttpError(404, 'not_found');
  const fy = await currentYear(db, now);
  const u = await fundUsage(db, fid, fy?.id ?? null);
  if (u.used > 0) throw new HttpError(409, 'fund_in_use');
  const t = now.toISOString();
  if (u.rows === 0) {
    await db.batch([
      stmt(db, 'DELETE FROM bank_accounts WHERE fund_source_id = ?1', [fid]),
      stmt(db, 'DELETE FROM fund_sources WHERE id = ?1', [fid]),
      audit(db, s, 'fund.delete', 'fund', fid, t, { name: f.name, mode: 'deleted' }),
    ]);
    return { id: fid, mode: 'deleted' };
  }
  if (!fy || fy.status !== 'open') throw new HttpError(409, 'no_open_fiscal_year');
  const batch: D1PreparedStatement[] = [];
  if (u.opening !== 0) batch.push(openingAdjustment(db, s, fy, fid, -u.opening, 'ปรับยอดยกมาเป็นศูนย์ (ลบแหล่งเงิน)', t));
  batch.push(
    // The name stays unique so the same name can be used again for a new fund.
    stmt(db, `UPDATE fund_sources SET is_active = 0, source_name = substr(source_name, 1, 80) || ' (ลบแล้ว ' || ?2 || ')' WHERE id = ?1`, [fid, t.slice(0, 19)]),
    stmt(db, 'UPDATE bank_accounts SET is_active = 0 WHERE fund_source_id = ?1', [fid]),
    audit(db, s, 'fund.delete', 'fund', fid, t, { name: f.name, mode: 'archived', opening_cleared_satang: u.opening }),
  );
  await db.batch(batch);
  return { id: fid, mode: 'archived' };
}

export async function addProject(db: D1Database, s: Session, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'proj');
  const name = text(body.name, 'name', 1, 120);
  const fund = text(body.fundSourceId, 'fund', 1, 60);
  const budget = bahtToSatang(body.budget);
  const fy = await currentYear(db, now);
  if (!fy || fy.status !== 'open') throw new HttpError(409, 'no_open_fiscal_year');
  if (await stmt(db, 'SELECT 1 AS x FROM projects WHERE fiscal_year_id = ?1 AND project_name = ?2', [fy.id, name]).first()) throw new HttpError(409, 'duplicate');
  const n = (await stmt(db, 'SELECT COUNT(*) AS n FROM projects WHERE fiscal_year_id = ?1', [fy.id]).first<{ n: number }>())?.n ?? 0;
  const pid = id('p'), t = now.toISOString();
  await db.batch([
    stmt(db, 'INSERT INTO projects (id, fiscal_year_id, fund_source_id, project_code, project_name, budget_amount_satang, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)', [pid, fy.id, fund, 'P' + String(n + 1).padStart(2, '0') + '-' + pid.slice(2, 6), name, budget, t]),
    audit(db, s, 'project.create', 'project', pid, t, { name, budget_satang: budget }),
  ]);
  return { id: pid };
}

/** Records what the bank book says. The ledger is never adjusted automatically. */
export async function reconcile(db: D1Database, s: Session, bid: string, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'review');
  const amount = bahtToSatangOrZero(body.amount);
  const b = await stmt(db, 'SELECT fund_source_id AS f FROM bank_accounts WHERE id = ?1 AND is_active = 1', [bid]).first<{ f: string }>();
  if (!b) throw new HttpError(404, 'not_found');
  const book = (await stmt(db, 'SELECT COALESCE(SUM(amount_satang), 0) AS n FROM ledger_entries WHERE fund_source_id = ?1', [b.f]).first<{ n: number }>())?.n ?? 0;
  const rid = id('rec'), t = now.toISOString();
  await db.batch([
    stmt(db, 'INSERT INTO bank_reconciliations (id, bank_account_id, as_of_date, statement_balance_satang, book_balance_satang, difference_satang, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)', [rid, bid, bangkokDate(now), amount, book, amount - book, s.userId, t]),
    audit(db, s, 'bank.reconcile', 'bank', bid, t, { statement_satang: amount, book_satang: book }),
  ]);
  return { id: rid, differenceSatang: amount - book };
}

// ---- Garuda crest image: private. In an R2 bucket when one is bound, otherwise in the D1 table stored_files.
// Either way it is served only to signed-in users through the Worker.
const MAX_CREST = 1024 * 1024;
function sniff(b: Uint8Array): { ext: string; type: string } | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  return null;
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function filePut(env: Env, key: string, buf: Uint8Array, type: string) {
  if (env.FILES) await env.FILES.put(key, buf, { httpMetadata: { contentType: type } });
  else await stmt(env.DB, 'INSERT INTO stored_files (object_key, content_type, data_base64, size_bytes) VALUES (?1, ?2, ?3, ?4)', [key, type, b64(buf), buf.length]).run();
}
async function fileGet(env: Env, key: string): Promise<BodyInit | null> {
  if (env.FILES) return ((await env.FILES.get(key))?.body as BodyInit | undefined) ?? null;
  const r = await stmt(env.DB, 'SELECT data_base64 AS d FROM stored_files WHERE object_key = ?1', [key]).first<{ d: string }>();
  return r ? unb64(r.d) : null;
}
async function fileDelete(env: Env, key: string) {
  if (env.FILES) await env.FILES.delete(key);
  else await stmt(env.DB, 'DELETE FROM stored_files WHERE object_key = ?1', [key]).run();
}
export async function putCrest(env: Env, s: Session, req: Request, now: Date) {
  requirePerm(s, 'docset');
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_CREST) throw new HttpError(413, 'file_too_large');
  const kind = sniff(buf); // decided from the bytes, not from the header the browser sends
  if (!kind) throw new HttpError(422, 'invalid_image');
  const old = await env.DB.prepare('SELECT crest_object_key AS k FROM school_settings WHERE id = 1').first<{ k: string | null }>();
  if (!old) throw new HttpError(409, 'settings_required');
  const key = `crest/${crypto.randomUUID()}.${kind.ext}`, t = now.toISOString();
  await filePut(env, key, buf, kind.type);
  await env.DB.batch([stmt(env.DB, 'UPDATE school_settings SET crest_object_key = ?1, updated_at = ?2, updated_by = ?3 WHERE id = 1', [key, t, s.userId]), audit(env.DB, s, 'settings.crest', 'settings', '1', t)]);
  if (old.k) await fileDelete(env, old.k);
  return { crest: key.slice(-12) };
}
export async function getCrest(env: Env, s: Session): Promise<Response> {
  requirePerm(s, 'read');
  const r = await env.DB.prepare('SELECT crest_object_key AS k FROM school_settings WHERE id = 1').first<{ k: string | null }>();
  const body = r?.k ? await fileGet(env, r.k) : null;
  if (!body) throw new HttpError(404, 'not_found');
  return new Response(body, { headers: { 'content-type': r!.k!.endsWith('.png') ? 'image/png' : 'image/jpeg', 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' } });
}
export async function deleteCrest(env: Env, s: Session, now: Date) {
  requirePerm(s, 'docset');
  const r = await env.DB.prepare('SELECT crest_object_key AS k FROM school_settings WHERE id = 1').first<{ k: string | null }>();
  if (!r?.k) return { ok: true };
  const t = now.toISOString();
  await env.DB.batch([stmt(env.DB, 'UPDATE school_settings SET crest_object_key = NULL, updated_at = ?1, updated_by = ?2 WHERE id = 1', [t, s.userId]), audit(env.DB, s, 'settings.crest_delete', 'settings', '1', t)]);
  await fileDelete(env, r.k);
  return { ok: true };
}
