// Login, users, the /api/state snapshot and master data, against real SQLite.
// Run: node --experimental-strip-types --test "tests/integration/*.test.ts"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createFakeD1 } from './fake-d1.ts';
import worker from '../../apps/api/src/index.ts';
import { hashPassword, verifyPassword } from '../../apps/api/src/services/password.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const ORIGIN = 'https://school.test';
const PW = 'Test-password-2570';
const HASH = await hashPassword(PW);

function fresh(seed = true) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  const dir = ROOT + 'database/migrations/';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(dir + f, 'utf8'));
  if (seed) {
    raw.exec(readFileSync(ROOT + 'database/seeds/dev_seed.sql', 'utf8'));
    raw.prepare('UPDATE users SET is_active = 1, password_hash = ?1').run(HASH);
  } else {
    raw.prepare(`INSERT INTO users (id, username, password_hash, full_name, is_active) VALUES ('u-admin', 'dev.admin', ?1, 'ผู้ดูแล', 1)`).run(HASH);
    raw.exec(`INSERT INTO user_roles VALUES ('u-admin', 'role-super-admin')`);
  }
  const files = new Map<string, { body: Uint8Array; type?: string }>();
  const FILES = {
    async put(k: string, b: Uint8Array, o?: any) { files.set(k, { body: b, type: o?.httpMetadata?.contentType }); },
    async get(k: string) { const f = files.get(k); return f ? { body: f.body } : null; },
    async delete(k: string) { files.delete(k); },
  };
  const ASSETS = { fetch: async () => new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }) };
  return { raw, files, env: { DB: createFakeD1(raw), FILES, ASSETS } as never, jar: {} as Record<string, string> };
}
type C = ReturnType<typeof fresh>;

async function call(c: C, as: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { origin: ORIGIN, ...extra };
  if (as && c.jar[as]) headers.cookie = `banrai_session=${c.jar[as]}`;
  let payload: BodyInit | undefined;
  if (body instanceof Uint8Array) payload = body;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body: payload }), c.env);
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, headers: res.headers, body: ct.includes('json') ? ((await res.json()) as Record<string, any>) : await res.arrayBuffer() } as { status: number; headers: Headers; body: any };
}
async function signIn(c: C, who: string, username: string, password = PW) {
  const r = await call(c, null, 'POST', '/api/auth/login', { username, password });
  const m = (r.headers.get('set-cookie') ?? '').match(/banrai_session=([^;]+)/);
  if (r.status === 200 && m) c.jar[who] = m[1];
  return r;
}
const all = async (c: C) => { for (const [k, u] of Object.entries({ admin: 'dev.admin', fin: 'dev.finance', acc: 'dev.accountant', dir: 'dev.director', aud: 'dev.auditor' })) assert.equal((await signIn(c, k, u)).status, 200); };

test('password hashing: salted, verifiable, rejects wrong input and foreign formats', async () => {
  const a = await hashPassword('correct horse 1'), b = await hashPassword('correct horse 1');
  assert.notEqual(a, b);
  assert.match(a, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword('correct horse 1', a), true);
  assert.equal(await verifyPassword('correct horse 2', a), false);
  assert.equal(await verifyPassword('x', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH'), false);
  assert.equal(await verifyPassword('x', 'pbkdf2-sha256$999999999$AA==$AA=='), false);
});

test('login sets a hardened cookie; wrong password and unknown user look the same', async () => {
  const c = fresh();
  const ok = await signIn(c, 'fin', 'Dev.Finance ');
  assert.equal(ok.status, 200);
  const ck = ok.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(ck.includes(flag), flag);
  assert.equal(JSON.stringify(ok.body).includes(c.jar.fin), false, 'token is not in the body');
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM sessions WHERE token_hash = ?1').get(c.jar.fin)!.n, 0, 'only the hash of the token is stored');
  const bad = await signIn(c, 'x', 'dev.finance', 'wrong-password-123');
  const none = await signIn(c, 'x', 'nobody.here', 'wrong-password-123');
  assert.deepEqual([bad.status, bad.body.error, none.status, none.body.error], [401, 'invalid_credentials', 401, 'invalid_credentials']);
  const meR = await call(c, 'fin', 'GET', '/api/auth/me');
  assert.equal(meR.body.username, 'dev.finance');
  assert.ok(meR.body.permissions.includes('create') && !meR.body.permissions.includes('approve'));
});

test('login needs the same origin (no cross-site login)', async () => {
  const c = fresh();
  const r = await call(c, null, 'POST', '/api/auth/login', { username: 'dev.finance', password: PW }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('five wrong passwords lock the account for a while, even for the right password', async () => {
  const c = fresh();
  for (let i = 0; i < 5; i++) assert.equal((await signIn(c, 'x', 'dev.finance', 'nope-nope-nope')).status, 401);
  const locked = await signIn(c, 'fin', 'dev.finance');
  assert.deepEqual([locked.status, locked.body.error], [429, 'account_locked']);
  c.raw.exec(`UPDATE login_attempts SET locked_until = '2000-01-01T00:00:00.000Z'`);
  assert.equal((await signIn(c, 'fin', 'dev.finance')).status, 200);
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM login_attempts').get()!.n, 0);
});

test('disabled accounts and seed placeholders cannot sign in', async () => {
  const c = fresh();
  c.raw.exec(`UPDATE users SET is_active = 0 WHERE id = 'u-fin'`);
  assert.equal((await signIn(c, 'fin', 'dev.finance')).status, 401);
  c.raw.exec(`UPDATE users SET password_hash = 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH' WHERE id = 'u-acc'`);
  assert.equal((await signIn(c, 'acc', 'dev.accountant', 'DISABLED-DEV-ONLY-NOT-A-REAL-HASH')).status, 401);
});

test('logout revokes the session', async () => {
  const c = fresh();
  await signIn(c, 'fin', 'dev.finance');
  assert.equal((await call(c, 'fin', 'POST', '/api/auth/logout', {})).status, 200);
  assert.equal((await call(c, 'fin', 'GET', '/api/auth/me')).status, 401);
});

test('user admin: create with temporary password, forced change, disable, reset', async () => {
  const c = fresh();
  await all(c);
  assert.equal((await call(c, 'dir', 'GET', '/api/users')).status, 403, 'only user_admin');
  assert.equal((await call(c, 'dir', 'POST', '/api/users', { username: 'new.user', fullName: 'ก', roleKey: 'finance', password: 'Temp-pass-9999' })).status, 403);
  assert.equal((await call(c, 'admin', 'POST', '/api/users', { username: 'new.user', fullName: 'ครูใหม่', roleKey: 'finance', password: 'short' })).body.error, 'password_too_short');
  assert.equal((await call(c, 'admin', 'POST', '/api/users', { username: 'new.user', fullName: 'ครูใหม่', roleKey: 'nope', password: 'Temp-pass-9999' })).body.error, 'invalid_role');
  const mk = await call(c, 'admin', 'POST', '/api/users', { username: 'New.User', fullName: 'ครูใหม่', roleKey: 'finance', password: 'Temp-pass-9999' });
  assert.equal(mk.status, 201, JSON.stringify(mk.body));
  assert.equal((await call(c, 'admin', 'POST', '/api/users', { username: 'new.user', fullName: 'ซ้ำ', roleKey: 'finance', password: 'Temp-pass-9999' })).status, 409);
  assert.ok(!String(c.raw.prepare('SELECT password_hash h FROM users WHERE id = ?1').get(mk.body.id)!.h).includes('Temp-pass'), 'no plain text');
  const li = await signIn(c, 'nu', 'new.user', 'Temp-pass-9999');
  assert.equal(li.body.mustChangePassword, true);
  assert.deepEqual([(await call(c, 'nu', 'GET', '/api/state')).status, (await call(c, 'nu', 'GET', '/api/state')).body.error], [403, 'password_change_required']);
  assert.equal((await call(c, 'nu', 'POST', '/api/auth/password', { currentPassword: 'bad', newPassword: 'My-new-pass-2570' })).status, 403);
  assert.equal((await call(c, 'nu', 'POST', '/api/auth/password', { currentPassword: 'Temp-pass-9999', newPassword: 'new.user-12345' })).body.error, 'password_contains_username');
  assert.equal((await call(c, 'nu', 'POST', '/api/auth/password', { currentPassword: 'Temp-pass-9999', newPassword: 'My-new-pass-2570' })).status, 200);
  assert.equal((await call(c, 'nu', 'GET', '/api/state')).status, 200);
  const list = await call(c, 'admin', 'GET', '/api/users');
  assert.ok(list.body.users.some((u: any) => u.username === 'new.user' && u.roleKeys.includes('finance') && u.password_hash === undefined));
  assert.equal((await call(c, 'admin', 'POST', `/api/users/u-admin/disable`, {})).body.error, 'cannot_change_self');
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${mk.body.id}/disable`, {})).status, 200);
  assert.equal((await call(c, 'nu', 'GET', '/api/auth/me')).status, 401, 'sessions die with the account');
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${mk.body.id}/enable`, {})).status, 200);
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${mk.body.id}/password`, { password: 'Reset-pass-1234' })).status, 200);
  assert.equal((await signIn(c, 'nu', 'new.user', 'My-new-pass-2570')).status, 401);
  assert.equal((await signIn(c, 'nu', 'new.user', 'Reset-pass-1234')).body.mustChangePassword, true);
});

test('/api/state mirrors the ledger: balances equal the fixture; audit log only for auditors', async () => {
  const c = fresh();
  await all(c);
  const fx = JSON.parse(readFileSync(ROOT + 'database/fixtures/expected_balances.json', 'utf8'));
  const s = (await call(c, 'fin', 'GET', '/api/state')).body;
  const total = s.led.reduce((a: number, l: any) => a + l.amt, 0);
  assert.equal(total, fx.total_balance_satang);
  assert.equal(s.fy.be, 2570);
  assert.equal(s.funds.length, 4);
  assert.ok(s.led.every((l: any) => ['open', 'inc', 'exp'].includes(l.kind) && Number.isInteger(l.amt)));
  assert.ok(s.exp.every((e: any) => typeof e.by === 'string' && typeof e.desc === 'string' && Number.isInteger(e.amt)));
  assert.equal(s.cfg.school, 'โรงเรียนบ้านไร่');
  assert.equal(s.log.length, 0, 'finance has no audit_read');
  assert.ok((await call(c, 'aud', 'GET', '/api/state')).body.log.length > 0);
  assert.equal((await call(c, null, 'GET', '/api/state')).status, 401);
});

test('state folds earlier years into one brought-forward row per fund', async () => {
  const c = fresh();
  await all(c);
  const before = (await call(c, 'fin', 'GET', '/api/state')).body.led.reduce((a: number, l: any) => a + l.amt, 0);
  assert.equal((await call(c, 'dir', 'POST', '/api/fiscal-years', { yearBe: 2571 })).status, 201);
  const later = new Date('2027-10-05T03:00:00.000Z');
  const { route } = await import('../../apps/api/src/index.ts');
  const res = await route(new Request(ORIGIN + '/api/state', { headers: { cookie: `banrai_session=${c.jar.fin}` } }), c.env, later).catch(() => null);
  // sessions last 12 hours, so this later request needs a fresh one
  c.raw.exec(`UPDATE sessions SET expires_at = '2099-01-01T00:00:00.000Z'`);
  const s = (await (await route(new Request(ORIGIN + '/api/state', { headers: { cookie: `banrai_session=${c.jar.fin}` } }), c.env, later)).json()) as any;
  assert.equal(res, null);
  assert.equal(s.fy.be, 2571);
  assert.equal(s.led.length, 4);
  assert.ok(s.led.every((l: any) => l.kind === 'open' && l.id.startsWith('bf-')));
  assert.equal(s.led.reduce((a: number, l: any) => a + l.amt, 0), before);
  assert.equal(s.inc.length + s.exp.length, 0);
});

test('settings: only docset may save; values round-trip', async () => {
  const c = fresh();
  await all(c);
  const body = { school: 'โรงเรียนบ้านไร่', addr: 'อ.ดอยเต่า', area: 'สพป.เชียงใหม่ เขต 5', dept: 'โรงเรียนบ้านไร่', to: 'ผู้อำนวยการ', logo: false, mmBy: 'dir', sg: { fin: { n: 'นางสาว ก', p: 'ครู' }, acc: { n: '', p: 'ครู' }, dir: { n: 'นาย ข', p: 'ผอ.' } } };
  assert.equal((await call(c, 'acc', 'PUT', '/api/settings', body)).status, 403);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings', { ...body, school: '' })).status, 422);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings', body)).status, 200);
  const cfg = (await call(c, 'fin', 'GET', '/api/state')).body.cfg;
  assert.deepEqual([cfg.addr, cfg.logo, cfg.mmBy, cfg.sg.fin.n, cfg.sg.dir.p], ['อ.ดอยเต่า', false, 'dir', 'นางสาว ก', 'ผอ.']);
});

test('funds, projects, bank reconciliation', async () => {
  const c = fresh();
  await all(c);
  assert.equal((await call(c, 'fin', 'POST', '/api/funds', { name: 'เงินบริจาค', opening: '1234.50' })).status, 403);
  const f = await call(c, 'dir', 'POST', '/api/funds', { name: 'เงินบริจาค', opening: '1234.50' });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  assert.equal((await call(c, 'dir', 'POST', '/api/funds', { name: 'เงินบริจาค', opening: '0' })).status, 409);
  assert.equal((await call(c, 'dir', 'POST', '/api/funds', { name: 'อื่น', opening: '1.234' })).status, 422);
  assert.equal(Number(c.raw.prepare('SELECT balance_satang b FROM v_fund_summary WHERE fund_source_id = ?1').get(f.body.id)!.b), 123450);
  assert.equal((await call(c, 'dir', 'POST', `/api/funds/${f.body.id}/rename`, { name: 'เงินบริจาคทั่วไป' })).status, 200);
  const st = (await call(c, 'fin', 'GET', '/api/state')).body;
  assert.ok(st.funds.some((x: any) => x.name === 'เงินบริจาคทั่วไป') && st.banks.some((b: any) => b.fund === f.body.id));
  assert.equal((await call(c, 'acc', 'POST', '/api/projects', { name: 'โครงการใหม่', fundSourceId: 'f1', budget: '5000' })).status, 403);
  assert.equal((await call(c, 'fin', 'POST', '/api/projects', { name: 'โครงการใหม่', fundSourceId: 'f1', budget: '5000' })).status, 201);
  assert.equal((await call(c, 'fin', 'POST', '/api/projects', { name: 'โครงการใหม่', fundSourceId: 'f1', budget: '5000' })).status, 409);
  assert.equal((await call(c, 'fin', 'POST', '/api/projects', { name: 'โครงการผิด', fundSourceId: 'nope', budget: '5000' })).status, 422);
  const bank = st.banks.find((b: any) => b.fund === 'f1');
  assert.equal((await call(c, 'fin', 'POST', `/api/banks/${bank.id}/reconcile`, { amount: '382150.00' })).status, 403);
  const rc = await call(c, 'acc', 'POST', `/api/banks/${bank.id}/reconcile`, { amount: '382150.00' });
  assert.deepEqual([rc.status, rc.body.differenceSatang], [201, 0]);
  assert.equal((await call(c, 'fin', 'GET', '/api/state')).body.banks.find((b: any) => b.id === bank.id).stmt, 38215000);
  assert.deepEqual(c.raw.prepare('SELECT * FROM v_integrity_issues').all(), []);
});

test('funds: edit opening balance and delete only while unused; the administrator acts in every role', async () => {
  const c = fresh();
  await all(c);
  const bal = (id: string) => Number(c.raw.prepare('SELECT balance_satang b FROM v_fund_summary WHERE fund_source_id = ?1').get(id)!.b);
  // A fund with an opening balance and nothing else: opening can be edited, then it can be deleted (archived).
  const a = (await call(c, 'dir', 'POST', '/api/funds', { name: 'ทดลอง', opening: '500' })).body.id;
  assert.equal((await call(c, 'fin', 'POST', `/api/funds/${a}/update`, { name: 'ทดลอง', opening: '700' })).status, 403);
  const up = await call(c, 'dir', 'POST', `/api/funds/${a}/update`, { name: 'ทดลอง 2', opening: '700.25' });
  assert.deepEqual([up.status, up.body.changed], [200, true], JSON.stringify(up.body));
  assert.equal(bal(a), 70025);
  let st = (await call(c, 'fin', 'GET', '/api/state')).body;
  assert.equal(st.funds.find((f: any) => f.id === a).name, 'ทดลอง 2');
  assert.equal(st.led.filter((l: any) => l.fund === a && l.kind === 'open').reduce((x: number, l: any) => x + l.amt, 0), 70025);
  assert.equal((await call(c, 'fin', 'POST', `/api/funds/${a}/delete`)).status, 403);
  const del = await call(c, 'dir', 'POST', `/api/funds/${a}/delete`);
  assert.deepEqual([del.status, del.body.mode], [200, 'archived'], JSON.stringify(del.body));
  assert.equal(bal(a), 0);
  st = (await call(c, 'fin', 'GET', '/api/state')).body;
  assert.ok(!st.funds.some((f: any) => f.id === a) && !st.banks.some((b: any) => b.fund === a) && !st.led.some((l: any) => l.fund === a));
  assert.equal((await call(c, 'dir', 'POST', '/api/funds', { name: 'ทดลอง 2', opening: '0' })).status, 201, 'the name is free again');
  // A fund with no ledger rows at all is removed outright.
  const b = (await call(c, 'dir', 'POST', '/api/funds', { name: 'ว่าง', opening: '0' })).body.id;
  assert.equal((await call(c, 'dir', 'POST', `/api/funds/${b}/delete`)).body.mode, 'deleted');
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM fund_sources WHERE id = ?1').get(b)!.n, 0);
  // A used fund (seed fund f1 has transactions) cannot be deleted; its opening is locked for the director but not for the administrator.
  assert.equal((await call(c, 'dir', 'POST', '/api/funds/f1/delete')).status, 409);
  assert.equal((await call(c, 'dir', 'POST', '/api/funds/f1/delete')).body.error, 'fund_in_use');
  const before = bal('f1');
  const open1 = Number(c.raw.prepare(`SELECT COALESCE(SUM(amount_satang),0) n FROM ledger_entries WHERE fund_source_id = 'f1' AND kind = 'opening'`).get()!.n);
  assert.equal((await call(c, 'dir', 'POST', '/api/funds/f1/update', { name: 'เงินอุดหนุนรายหัว', opening: String(open1 / 100 + 1) })).body.error, 'fund_in_use');
  assert.equal((await call(c, 'admin', 'POST', '/api/funds/f1/update', { name: c.raw.prepare(`SELECT source_name n FROM fund_sources WHERE id = 'f1'`).get()!.n, opening: String(open1 / 100 + 1) })).status, 200);
  assert.equal(bal('f1'), before + 100);
  // The administrator now holds every permission, but still cannot approve what they created themselves.
  const me = (await call(c, 'admin', 'GET', '/api/state')).body.me;
  for (const p of ['create', 'pay', 'review', 'confirm', 'reverse', 'approve', 'setup', 'user_admin']) assert.ok(me.permissions.includes(p), p);
  assert.deepEqual(c.raw.prepare('SELECT * FROM v_integrity_issues').all(), []);
  const actions = (c.raw.prepare(`SELECT action FROM audit_logs WHERE entity_type = 'fund'`).all() as any[]).map((r) => r.action);
  for (const x of ['fund.opening', 'fund.delete', 'fund.rename']) assert.ok(actions.includes(x), x);
});

test('users: the administrator edits accounts and deletes them (unused -> removed, used -> retired)', async () => {
  const c = fresh();
  await all(c);
  const list = async () => (await call(c, 'admin', 'GET', '/api/users')).body.users as any[];
  const fin = (await list()).find((u) => u.username === 'dev.finance');
  // edit name, position and role
  assert.equal((await call(c, 'fin', 'POST', `/api/users/${fin.id}/update`, { fullName: 'x', roleKey: 'director' })).status, 403);
  const up = await call(c, 'admin', 'POST', `/api/users/${fin.id}/update`, { fullName: 'นายสมชาย ใจดี', position: 'ครู', roleKey: 'accountant' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  let u = (await list()).find((x) => x.id === fin.id);
  assert.deepEqual([u.fullName, u.position, u.roleKeys], ['นายสมชาย ใจดี', 'ครู', ['accountant']]);
  assert.ok((await call(c, 'fin', 'GET', '/api/state')).body.me.permissions.includes('review'), 'new role applies at once');
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${fin.id}/update`, { fullName: 'x', roleKey: 'nope' })).status, 422);
  // own account: name yes, role no
  const me = (await list()).find((x) => x.username === 'dev.admin');
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${me.id}/update`, { fullName: 'ผู้ดูแล ใหม่', roleKey: 'super_admin' })).status, 200);
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${me.id}/update`, { fullName: 'ผู้ดูแล ใหม่', roleKey: 'auditor' })).body.error, 'cannot_change_self');
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${me.id}/delete`)).body.error, 'cannot_change_self');
  // a never-used account is removed outright
  const nu = await call(c, 'admin', 'POST', '/api/users', { username: 'temp.user', fullName: 'ทดลอง', roleKey: 'auditor', password: 'Temp-password-123' });
  assert.equal(nu.status, 201);
  assert.equal((await call(c, 'admin', 'POST', `/api/users/${nu.body.id}/delete`)).body.mode, 'deleted');
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM users WHERE id = ?1').get(nu.body.id)!.n, 0);
  // a used account (signed in, has transactions) is retired: hidden, signed out, cannot sign in, username free
  const del = await call(c, 'admin', 'POST', `/api/users/${fin.id}/delete`);
  assert.deepEqual([del.status, del.body.mode], [200, 'retired'], JSON.stringify(del.body));
  assert.ok(!(await list()).some((x) => x.id === fin.id));
  assert.equal((await call(c, 'fin', 'GET', '/api/state')).status, 401);
  assert.equal((await signIn(c, 'fin2', 'dev.finance')).status, 401);
  assert.equal((await call(c, 'admin', 'POST', '/api/users', { username: 'dev.finance', fullName: 'คนใหม่', roleKey: 'finance', password: 'Temp-password-123' })).status, 201);
  assert.ok(c.raw.prepare('SELECT COUNT(*) n FROM audit_logs WHERE user_id = ?1').get(fin.id)!.n > 0, 'history kept');
  assert.deepEqual(c.raw.prepare('SELECT * FROM v_integrity_issues').all(), []);
});

test('fiscal years: create, refuse closing with open items, close blocks new postings', async () => {
  const c = fresh(false);
  await signIn(c, 'admin', 'dev.admin');
  const empty = (await call(c, 'admin', 'GET', '/api/state')).body;
  assert.deepEqual([empty.fy, empty.hasSettings], [null, false]);
  assert.equal((await call(c, 'admin', 'POST', '/api/fiscal-years', { yearBe: 1999 })).status, 422);
  const fy = await call(c, 'admin', 'POST', '/api/fiscal-years', { yearBe: 2570 });
  assert.equal(fy.status, 201);
  assert.deepEqual({ ...c.raw.prepare(`SELECT start_date s, end_date e FROM fiscal_years WHERE id = 'fy-2570'`).get() }, { s: '2026-10-01', e: '2027-09-30' });
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM document_sequences').get()!.n, 2);
  assert.equal((await call(c, 'admin', 'POST', '/api/fiscal-years', { yearBe: 2570 })).status, 409);
  const f = await call(c, 'admin', 'POST', '/api/funds', { name: 'เงินอุดหนุน', opening: '1000' });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  assert.equal((await call(c, 'admin', 'POST', '/api/fiscal-years/fy-2570/close', {})).status, 200);
  assert.equal((await call(c, 'admin', 'POST', '/api/fiscal-years/fy-2570/close', {})).status, 409);
  assert.equal((await call(c, 'admin', 'POST', '/api/funds', { name: 'อีกกอง', opening: '5' })).body.error, 'no_open_fiscal_year');
});

test('crest image lives in private storage: type is checked from the bytes, only signed-in users can read it', async () => {
  const c = fresh();
  await all(c);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  assert.equal((await call(c, 'acc', 'PUT', '/api/settings/crest', png)).status, 403);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings/crest', new TextEncoder().encode('<svg onload=alert(1)>'), { 'content-type': 'image/png' })).body.error, 'invalid_image');
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings/crest', new Uint8Array(1024 * 1024 + 1).fill(0xff))).status, 413);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings/crest', png)).status, 200);
  assert.equal(c.files.size, 1);
  assert.ok([...c.files.keys()][0].startsWith('crest/'));
  assert.equal((await call(c, null, 'GET', '/api/settings/crest')).status, 401);
  const got = await call(c, 'aud', 'GET', '/api/settings/crest');
  assert.deepEqual([got.status, got.headers.get('content-type'), new Uint8Array(got.body).length], [200, 'image/png', 12]);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings/crest', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).status, 200);
  assert.equal(c.files.size, 1, 'old object removed');
  assert.ok((await call(c, 'fin', 'GET', '/api/state')).body.cfg.crest);
  assert.equal((await call(c, 'fin', 'DELETE', '/api/settings/crest')).status, 200);
  assert.deepEqual([c.files.size, (await call(c, 'fin', 'GET', '/api/settings/crest')).status], [0, 404]);
});

test('the web app is served with security headers; unknown API paths stay JSON 404', async () => {
  const c = fresh();
  const page = await call(c, null, 'GET', '/');
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy')!.includes("frame-ancestors 'none'"));
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  await signIn(c, 'fin', 'dev.finance');
  const nf = await call(c, 'fin', 'GET', '/api/nope');
  assert.deepEqual([nf.status, nf.body.error], [404, 'not_found']);
  assert.equal((await call(c, null, 'POST', '/')).status, 404);
});

test('audit trail records sign-ins and admin actions without secrets', async () => {
  const c = fresh();
  await all(c);
  await signIn(c, 'x', 'dev.finance', 'wrong-password-xyz');
  await call(c, 'admin', 'POST', '/api/users', { username: 'a.b.c', fullName: 'ก', roleKey: 'auditor', password: 'Temp-pass-9999' });
  const rows = c.raw.prepare('SELECT action, new_value v, entity_id e FROM audit_logs').all() as any[];
  const acts = rows.map((r) => r.action);
  for (const a of ['auth.login', 'auth.login_failed', 'user.create']) assert.ok(acts.includes(a), a);
  assert.ok(!JSON.stringify(rows).includes('Temp-pass') && !JSON.stringify(rows).includes('wrong-password') && !JSON.stringify(rows).includes(PW));
});

test('without an R2 bucket the crest image is kept in the database and still needs a session', async () => {
  const c = fresh();
  (c.env as any).FILES = undefined;
  await all(c);
  const png = new Uint8Array(70000).fill(7);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings/crest', png)).status, 200);
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM stored_files').get()!.n, 1);
  assert.equal((await call(c, null, 'GET', '/api/settings/crest')).status, 401);
  const got = await call(c, 'aud', 'GET', '/api/settings/crest');
  assert.deepEqual([got.status, got.headers.get('content-type')], [200, 'image/png']);
  assert.deepEqual([...new Uint8Array(got.body)], [...png]);
  assert.equal((await call(c, 'fin', 'PUT', '/api/settings/crest', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))).status, 200);
  assert.equal(c.raw.prepare('SELECT COUNT(*) n FROM stored_files').get()!.n, 1, 'old image removed');
  assert.equal((await call(c, 'fin', 'DELETE', '/api/settings/crest')).status, 200);
  assert.deepEqual([c.raw.prepare('SELECT COUNT(*) n FROM stored_files').get()!.n, (await call(c, 'fin', 'GET', '/api/settings/crest')).status], [0, 404]);
});
