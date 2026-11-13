// A local stand-in for Cloudflare: the real Worker code + real SQLite (in memory) + the real web app.
// For trying the full system on one machine and for browser tests. NOT for real data: everything is lost on exit.
//   node --experimental-strip-types tests/e2e/local-server.ts            (empty database, admin only)
//   node --experimental-strip-types tests/e2e/local-server.ts --seed     (sample data, 5 sample users)
// The password for every account is printed at start; it exists only in this process.
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createFakeD1 } from '../integration/fake-d1.ts';
import worker from '../../apps/api/src/index.ts';
import { hashPassword } from '../../apps/api/src/services/password.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8788);
const PASSWORD = process.env.LOCAL_PASSWORD ?? 'Local-test-' + crypto.randomUUID().slice(0, 8);
const seed = process.argv.includes('--seed');

const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON');
const dir = ROOT + 'database/migrations/';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) raw.exec(readFileSync(dir + f, 'utf8'));
const hash = await hashPassword(PASSWORD);
if (seed) {
  raw.exec(readFileSync(ROOT + 'database/seeds/dev_seed.sql', 'utf8'));
  raw.prepare('UPDATE users SET is_active = 1, password_hash = ?1').run(hash);
} else {
  raw.prepare(`INSERT INTO users (id, username, password_hash, full_name, position, is_active, must_change_password) VALUES ('u-admin', 'admin', ?1, 'ผู้ดูแลระบบ', 'ผู้ดูแลระบบ', 1, 1)`).run(hash);
  raw.exec(`INSERT INTO user_roles VALUES ('u-admin', 'role-super-admin')`);
}
const files = new Map<string, Uint8Array>();
const env = {
  DB: createFakeD1(raw),
  FILES: { put: async (k: string, b: Uint8Array) => void files.set(k, b), get: async (k: string) => (files.has(k) ? { body: files.get(k) } : null), delete: async (k: string) => void files.delete(k) },
  ASSETS: { fetch: async (req: Request) => (['/', '/index.html'].includes(new URL(req.url).pathname) ? new Response(readFileSync(ROOT + 'apps/web/public/index.html'), { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('not found', { status: 404 })) },
} as never;

createServer(async (q, r) => {
  const chunks: Buffer[] = [];
  for await (const c of q) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(q.headers)) if (typeof v === 'string') headers.set(k, v);
  const res = await worker.fetch(new Request(`http://localhost:${PORT}${q.url}`, { method: q.method, headers, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : body }), env);
  const out: Record<string, string | string[]> = {};
  res.headers.forEach((v, k) => (out[k] = v));
  r.writeHead(res.status, out);
  r.end(Buffer.from(await res.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`BanRai Finance (local test) http://localhost:${PORT}`);
  console.log(seed ? `users: dev.admin dev.finance dev.accountant dev.director dev.auditor` : `user: admin (must change password at first sign-in)`);
  console.log(`password: ${PASSWORD}`);
});
