// Run: node --experimental-strip-types --test "tests/integration/*.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createFakeD1 } from './fake-d1.ts';
import { route } from '../../apps/api/src/index.ts';
import { bahtToSatang, bangkokDate, isIsoDate } from '../../apps/api/src/validators/money.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const ORIGIN = 'https://school.test';
const TOKENS: Record<string, string> = { fin: 'tok-finance-0000000000001', acc: 'tok-account-0000000000002', dir: 'tok-director-000000000003', aud: 'tok-auditor-0000000000004', admin: 'tok-admin-000000000000005' };
const USER: Record<string, string> = { fin: 'u-fin', acc: 'u-acc', dir: 'u-dir', aud: 'u-aud', admin: 'u-admin' };
let n = 0;

function freshDb() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const dir = ROOT + 'database/migrations/';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(dir + f, 'utf8'));
  raw.exec(readFileSync(ROOT + 'database/seeds/dev_seed.sql', 'utf8'));
  // dev users are disabled on purpose; the test turns them on and gives each a session
  raw.exec('UPDATE users SET is_active = 1');
  for (const [k, tok] of Object.entries(TOKENS)) {
    const h = createHash('sha256').update(tok).digest('hex');
    raw.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)').run(`s-${k}`, USER[k], h, '2099-01-01T00:00:00.000Z');
  }
  const env = { DB: createFakeD1(raw) as never, FILES: {} as never };
  return { raw, env };
}

type Ctx = ReturnType<typeof freshDb>;
const NOW = new Date('2026-11-13T05:00:00.000Z');

async function send(c: Ctx, req: Request): Promise<Response> {
  try {
    return await route(req, c.env, NOW);
  } catch (e) {
    const { errorResponse } = await import('../../apps/api/src/http.ts');
    return errorResponse(e);
  }
}

async function call(c: Ctx, as: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { origin: ORIGIN, ...extra };
  if (as) headers.cookie = `banrai_session=${TOKENS[as]}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const req = new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await send(c, req);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const key = () => `idem-${++n}-${'x'.repeat(8)}`;
const balance = (c: Ctx, fund: string) => Number((c.raw.prepare('SELECT balance_satang b FROM v_fund_summary WHERE fund_source_id = ?1').get(fund) as any).b);
const issues = (c: Ctx) => c.raw.prepare('SELECT * FROM v_integrity_issues').all();
const exp = (over: Record<string, unknown> = {}) => ({ fundSourceId: 'f1', transactionDate: '2026-11-13', partyName: 'ร้านทดสอบ', description: 'ค่าทดสอบ', paymentMethod: 'โอน', amount: '3000.00', ...over });

async function expenseToApproved(c: Ctx, over: Record<string, unknown> = {}) {
  const r = await call(c, 'fin', 'POST', '/api/expenses', exp(over));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.id as string;
  assert.equal((await call(c, 'fin', 'POST', `/api/expenses/${id}/submit`, {})).status, 200);
  assert.equal((await call(c, 'acc', 'POST', `/api/expenses/${id}/review`, {})).status, 200);
  assert.equal((await call(c, 'dir', 'POST', `/api/expenses/${id}/approve`, {})).status, 200);
  return id;
}

test('health is public; everything else needs a session', async () => {
  const c = freshDb();
  assert.equal((await call(c, null, 'GET', '/api/health')).status, 200);
  assert.equal((await call(c, null, 'GET', '/api/funds/summary')).status, 401);
  const bad = await send(c, new Request(ORIGIN + '/api/funds/summary', { headers: { cookie: 'banrai_session=not-a-real-token-xxxxxxxxxxxx' } }));
  assert.equal(bad.status, 401);
});

test('disabled dev users cannot use a session, expired/revoked sessions are refused', async () => {
  const c = freshDb();
  c.raw.exec("UPDATE users SET is_active = 0 WHERE id = 'u-fin'");
  assert.equal((await call(c, 'fin', 'GET', '/api/funds/summary')).status, 401);
  c.raw.exec("UPDATE users SET is_active = 1 WHERE id = 'u-fin'; UPDATE sessions SET revoked_at = '2026-01-01T00:00:00Z' WHERE id = 's-fin'");
  assert.equal((await call(c, 'fin', 'GET', '/api/funds/summary')).status, 401);
});

test('T01 receive 10,000 baht and post: balance +10,000, receipt number issued, ledger row created', async () => {
  const c = freshDb();
  const before = balance(c, 'f1');
  const r = await call(c, 'fin', 'POST', '/api/income', { fundSourceId: 'f1', transactionDate: '2026-11-13', partyName: 'ผู้ปกครอง', description: 'ทดสอบรับเงิน', paymentMethod: 'โอน', amount: '10000.00' });
  assert.equal(r.status, 201);
  const ok = await call(c, 'acc', 'POST', `/api/income/${r.body.id}/confirm`, {}, { 'idempotency-key': key() });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.number, 'ร.70/0005');
  assert.equal(balance(c, 'f1'), before + 1_000_000);
  assert.deepEqual(issues(c), []);
});

test('T02/T03 full expense flow: pay 3,000 baht, balance drops by 3,000, voucher number issued', async () => {
  const c = freshDb();
  const before = balance(c, 'f1');
  const id = await expenseToApproved(c);
  const pay = await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': key() });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  assert.equal(pay.body.number, 'จ.70/0004');
  assert.equal(balance(c, 'f1'), before - 300_000);
  assert.deepEqual(issues(c), []);
});

test('approved is only a commitment: it does not reduce the balance', async () => {
  const c = freshDb();
  const before = balance(c, 'f1');
  await expenseToApproved(c);
  assert.equal(balance(c, 'f1'), before);
  const s = (await call(c, 'fin', 'GET', '/api/funds/summary')).body.funds.find((f: any) => f.fund_source_id === 'f1');
  assert.equal(s.committed_satang, 642_000 + 300_000);
});

test('T04 paying more than the fund holds is refused and nothing changes', async () => {
  const c = freshDb();
  const id = await expenseToApproved(c, { fundSourceId: 'f4', amount: '60000.00' });
  const before = balance(c, 'f4');
  const pay = await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': key() });
  assert.equal(pay.status, 409);
  assert.equal(pay.body.error, 'insufficient_funds');
  assert.equal(balance(c, 'f4'), before);
  assert.equal((c.raw.prepare('SELECT status s FROM expense_transactions WHERE id = ?1').get(id) as any).s, 'approved');
  assert.equal((c.raw.prepare("SELECT last_no n FROM document_sequences WHERE doc_type = 'voucher'").get() as any).n, 3, 'no voucher number consumed');
});

test('T05 permissions are checked on the server', async () => {
  const c = freshDb();
  assert.equal((await call(c, 'aud', 'POST', '/api/expenses', exp())).status, 403);
  const r = await call(c, 'fin', 'POST', '/api/expenses', exp());
  await call(c, 'fin', 'POST', `/api/expenses/${r.body.id}/submit`, {});
  assert.equal((await call(c, 'fin', 'POST', `/api/expenses/${r.body.id}/review`, {})).status, 403);
  assert.equal((await call(c, 'acc', 'POST', `/api/expenses/${r.body.id}/review`, {})).status, 200);
  assert.equal((await call(c, 'acc', 'POST', `/api/expenses/${r.body.id}/approve`, {})).status, 403);
  assert.equal((await call(c, 'aud', 'GET', '/api/funds/summary')).status, 200, 'auditor may read');
  assert.equal((await call(c, 'fin', 'GET', '/api/audit-logs')).status, 403, 'finance may not read the audit log');
  assert.equal((await call(c, 'aud', 'GET', '/api/audit-logs')).status, 200);
});

test('separation of duties: a requester cannot review or approve their own request (database rule)', async () => {
  const c = freshDb();
  c.raw.exec("INSERT INTO user_roles (user_id, role_id) VALUES ('u-acc', 'role-finance'), ('u-dir', 'role-finance')");
  const r = await call(c, 'acc', 'POST', '/api/expenses', exp());
  assert.equal(r.status, 201);
  await call(c, 'acc', 'POST', `/api/expenses/${r.body.id}/submit`, {});
  const self = await call(c, 'acc', 'POST', `/api/expenses/${r.body.id}/review`, {});
  assert.equal(self.status, 403);
  assert.equal(self.body.error, 'separation_of_duties');
  // income: the person who prepared it cannot confirm it
  const inc = await call(c, 'acc', 'POST', '/api/income', { fundSourceId: 'f1', transactionDate: '2026-11-13', partyName: 'x', description: 'x', paymentMethod: 'โอน', amount: '1.00' });
  const selfConfirm = await call(c, 'acc', 'POST', `/api/income/${inc.body.id}/confirm`, {}, { 'idempotency-key': key() });
  assert.equal(selfConfirm.status, 403);
  assert.equal(selfConfirm.body.error, 'separation_of_duties');
});

test('T06 posting twice with the same Idempotency-Key posts once; another key is refused', async () => {
  const c = freshDb();
  const id = await expenseToApproved(c);
  const k = key();
  const a = await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': k });
  const b = await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': k });
  assert.equal(a.status, 200);
  assert.equal(a.body.replayed, false);
  assert.equal(b.status, 200);
  assert.equal(b.body.replayed, true);
  assert.equal(b.body.number, a.body.number);
  assert.equal((c.raw.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE source_id = ?1").get(id) as any).n, 1);
  assert.equal((c.raw.prepare("SELECT last_no n FROM document_sequences WHERE doc_type = 'voucher'").get() as any).n, 4, 'sequence bumped once');
  assert.equal((c.raw.prepare("SELECT COUNT(*) n FROM transaction_events WHERE entity_id = ?1 AND action = 'pay'").get(id) as any).n, 1);
  const other = await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': key() });
  assert.equal(other.status, 409);
  assert.equal(other.body.error, 'already_posted');
  assert.equal((await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {})).status, 400, 'Idempotency-Key is required');
});

test('T07 reversal keeps the original, adds a mirror entry, needs a reason, works once', async () => {
  const c = freshDb();
  const id = await expenseToApproved(c);
  await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': key() });
  const afterPay = balance(c, 'f1');
  assert.equal((await call(c, 'acc', 'POST', `/api/expenses/${id}/reverse`, {}, { 'idempotency-key': key() })).status, 422, 'reason is required');
  assert.equal((await call(c, 'fin', 'POST', `/api/expenses/${id}/reverse`, { reason: 'ทดสอบ' }, { 'idempotency-key': key() })).status, 403);
  const k = key();
  const rev = await call(c, 'acc', 'POST', `/api/expenses/${id}/reverse`, { reason: 'จ่ายซ้ำ' }, { 'idempotency-key': k });
  assert.equal(rev.status, 200, JSON.stringify(rev.body));
  assert.equal(balance(c, 'f1'), afterPay + 300_000);
  assert.equal((c.raw.prepare('SELECT COUNT(*) n FROM ledger_entries WHERE source_id = ?1').get(id) as any).n, 2, 'original + reversal');
  assert.equal((await call(c, 'acc', 'POST', `/api/expenses/${id}/reverse`, { reason: 'จ่ายซ้ำ' }, { 'idempotency-key': k })).body.replayed, true);
  const again = await call(c, 'acc', 'POST', `/api/expenses/${id}/reverse`, { reason: 'อีกครั้ง' }, { 'idempotency-key': key() });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'already_reversed');
  assert.deepEqual(issues(c), []);
});

test('income reversal restores the balance', async () => {
  const c = freshDb();
  const base = balance(c, 'f1');
  const r = await call(c, 'fin', 'POST', '/api/income', { fundSourceId: 'f1', transactionDate: '2026-11-13', partyName: 'x', description: 'รับ', paymentMethod: 'โอน', amount: '500.00' });
  await call(c, 'acc', 'POST', `/api/income/${r.body.id}/confirm`, {}, { 'idempotency-key': key() });
  assert.equal(balance(c, 'f1'), base + 50_000);
  assert.equal((await call(c, 'acc', 'POST', `/api/income/${r.body.id}/reverse`, { reason: 'รับผิดบัญชี' }, { 'idempotency-key': key() })).status, 200);
  assert.equal(balance(c, 'f1'), base);
  assert.deepEqual(issues(c), []);
});

test('posted rows cannot be edited or deleted; ledger, audit and events are append-only (direct SQL)', () => {
  const c = freshDb();
  const run = (sql: string) => () => c.raw.exec(sql);
  assert.throws(run("UPDATE income_transactions SET amount_satang = 1 WHERE id = 'inc-0001'"), /immutable_after_post/);
  assert.throws(run("UPDATE expense_transactions SET payee_name = 'x' WHERE id = 'exp-0001'"), /immutable_after_post/);
  assert.throws(run("DELETE FROM income_transactions WHERE id = 'inc-0001'"), /delete_not_allowed/);
  assert.throws(run("DELETE FROM expense_transactions WHERE id = 'exp-0001'"), /delete_not_allowed/);
  assert.throws(run("UPDATE ledger_entries SET amount_satang = 1 WHERE id = 'led-inc-0001'"), /append_only/);
  assert.throws(run("DELETE FROM ledger_entries WHERE id = 'led-inc-0001'"), /append_only/);
  assert.throws(run("DELETE FROM audit_logs"), /append_only/);
  assert.throws(run("UPDATE transaction_events SET action = 'x'"), /append_only/);
  assert.throws(run("UPDATE expense_transactions SET status = 'draft' WHERE id = 'exp-0001'"), /invalid_status_transition/);
  assert.throws(run("INSERT INTO expense_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payee_name, description, amount_satang, payment_method, status, created_by) VALUES ('x','fy-2570','f1','2026-11-13','a','b',100,'โอน','paid','u-fin')"), /initial_status_must_be_draft/);
});

test('T09 duplicate receipt/voucher numbers are rejected by the database', () => {
  const c = freshDb();
  c.raw.exec("INSERT INTO income_transactions (id, fiscal_year_id, fund_source_id, transaction_date, payer_name, description, amount_satang, payment_method, created_by) VALUES ('dup','fy-2570','f1','2026-11-13','a','b',100,'โอน','u-fin')");
  assert.throws(() => c.raw.exec("UPDATE income_transactions SET status='posted', receipt_number='ร.70/0001', posted_by='u-acc', posted_at='2026-11-13T00:00:00Z', post_idempotency_key='dupkey' WHERE id='dup'"), /UNIQUE/);
});

test('a ledger row cannot be forged for an unposted transaction or with a wrong amount', () => {
  const c = freshDb();
  const ins = (amt: number, src: string) => () => c.raw.exec(`INSERT INTO ledger_entries (id, fiscal_year_id, fund_source_id, entry_date, amount_satang, kind, source_type, source_id, description, idempotency_key, created_by) VALUES ('forge${amt}','fy-2570','f1','2026-11-13',${amt},'income','income','${src}','x','forge${amt}','u-fin')`);
  assert.throws(ins(100, 'inc-0005'), /ledger_source_mismatch/); // draft income
  assert.throws(ins(5, 'inc-0001'), /ledger_source_mismatch/); // wrong amount
});

test('T11 nothing can be posted into a closed fiscal year', async () => {
  const c = freshDb();
  const id = await expenseToApproved(c);
  c.raw.exec("UPDATE fiscal_years SET status = 'closed', closed_at = '2027-10-01T00:00:00Z', closed_by = 'u-dir'");
  const pay = await call(c, 'fin', 'POST', `/api/expenses/${id}/pay`, {}, { 'idempotency-key': key() });
  assert.equal(pay.status, 409);
  assert.equal(pay.body.error, 'fiscal_year_closed');
  assert.equal((await call(c, 'fin', 'POST', '/api/expenses', exp())).body.error, 'fiscal_year_closed');
});

test('project must belong to the same fund and year', async () => {
  const c = freshDb();
  const r = await call(c, 'fin', 'POST', '/api/expenses', exp({ projectId: 'p2' })); // p2 belongs to f2, not f1
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'project_fund_mismatch');
  assert.equal((await call(c, 'fin', 'POST', '/api/expenses', exp({ projectId: 'p1' }))).status, 201);
});

test('input validation: money is a decimal string, dates are real dates, origin is checked', async () => {
  const c = freshDb();
  for (const amount of ['12.345', '0', '0.00', '-5', '1e3', 'abc', '', 100, 12.5, null, '99999999999.00'])
    assert.equal((await call(c, 'fin', 'POST', '/api/expenses', exp({ amount }))).status, 422, `amount ${String(amount)}`);
  for (const transactionDate of ['2026-02-30', '13/11/2026', '2026-11-13T00:00:00Z', ''])
    assert.equal((await call(c, 'fin', 'POST', '/api/expenses', exp({ transactionDate }))).status, 422, `date ${transactionDate}`);
  assert.equal((await call(c, 'fin', 'POST', '/api/expenses', exp({ transactionDate: '2030-01-01' }))).body.error, 'no_fiscal_year_for_date');
  assert.equal((await call(c, 'fin', 'POST', '/api/expenses', exp({ description: '   ' }))).status, 422);
  const evil = await send(c, new Request(ORIGIN + '/api/expenses', { method: 'POST', headers: { origin: 'https://evil.test', cookie: `banrai_session=${TOKENS.fin}` }, body: '{}' }));
  assert.equal(evil.status, 403);
  const noOrigin = await send(c, new Request(ORIGIN + '/api/expenses', { method: 'POST', headers: { cookie: `banrai_session=${TOKENS.fin}` }, body: '{}' }));
  assert.equal(noOrigin.status, 403);
  const badJson = await send(c, new Request(ORIGIN + '/api/expenses', { method: 'POST', headers: { origin: ORIGIN, cookie: `banrai_session=${TOKENS.fin}` }, body: '{oops' }));
  assert.equal(badJson.status, 400);
  assert.equal((await call(c, 'acc', 'POST', '/api/expenses/nope/review', {})).status, 404);
});

test('T10 dashboard numbers equal the ledger; sample data matches the prototype', async () => {
  const c = freshDb();
  const s = (await call(c, 'aud', 'GET', '/api/funds/summary')).body.funds as any[];
  const by = Object.fromEntries(s.map((f) => [f.fund_source_id, f]));
  assert.equal(by.f1.balance_satang, 38_215_000);
  assert.equal(by.f2.balance_satang, 16_960_000);
  assert.equal(by.f3.balance_satang, 12_320_000);
  assert.equal(by.f4.balance_satang, 5_400_000);
  assert.equal(by.f1.committed_satang, 642_000);
  const total = s.reduce((a, f) => a + f.balance_satang, 0);
  const ledger = Number((c.raw.prepare('SELECT SUM(amount_satang) t FROM ledger_entries').get() as any).t);
  assert.equal(total, ledger);
  assert.equal(total, 72_895_000); // 728,950.00 baht, same as the prototype dashboard
  assert.deepEqual((await call(c, 'aud', 'GET', '/api/integrity')).body.issues, []);
});

test('listing endpoints', async () => {
  const c = freshDb();
  const all = await call(c, 'fin', 'GET', '/api/expenses');
  assert.equal(all.body.items.length, 6);
  const paid = await call(c, 'fin', 'GET', '/api/expenses?status=paid');
  assert.equal(paid.body.items.length, 3);
  assert.equal((await call(c, 'fin', 'GET', '/api/income?status=draft')).body.items.length, 1);
  assert.equal((await call(c, 'fin', 'GET', '/api/income?status=%27%3B%20DROP%20TABLE')).body.items.length, 5, 'unknown status ignored, never interpolated');
});

test('money helpers', () => {
  assert.equal(bahtToSatang('1234.5'), 123_450);
  assert.equal(bahtToSatang('0.01'), 1);
  assert.equal(bahtToSatang('9999999999.99'), 999_999_999_999);
  assert.throws(() => bahtToSatang('0.001'));
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(bangkokDate(new Date('2026-11-12T18:30:00Z')), '2026-11-13', '01:30 in Bangkok is already the 13th');
  assert.equal(bangkokDate(new Date('2026-11-13T16:59:00Z')), '2026-11-13');
});
