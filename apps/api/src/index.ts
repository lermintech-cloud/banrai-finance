import { HttpError, errorResponse, json } from './http.ts';
import { assertSameOrigin, getSession, requirePerm, sessionCookie } from './middleware/auth.ts';
import { auditLogs, fundSummary, integrityIssues, listTransactions } from './repositories/reports.ts';
import { SESSION_HOURS, changePassword, login, logout, me } from './services/auth.ts';
import { addFund, addProject, closeFiscalYear, createFiscalYear, deleteCrest, getCrest, putCrest, reconcile, renameFund, saveSettings, state } from './services/master.ts';
import { createUser, listUsers, resetPassword, setActive } from './services/users.ts';
import { advance, createTransaction, idempotencyKey, post, reverse } from './services/workflow.ts';
import type { Env, Kind } from './types.ts';

const MAX_BODY = 16 * 1024;
const COLLECTION: Record<string, Kind> = { income: 'income', expenses: 'expense' };
// action -> which kinds support it
const ACTIONS: Record<string, Kind[]> = {
  submit: ['income', 'expense'],
  review: ['expense'],
  approve: ['expense'],
  reject: ['income', 'expense'],
  confirm: ['income'],
  pay: ['expense'],
  reverse: ['income', 'expense'],
};
const ID = '([A-Za-z0-9_-]{1,80})';

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY) throw new HttpError(413, 'body_too_large');
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'body_too_large');
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// The web app is one HTML file with inline script and style, so 'unsafe-inline' is required for now.
// Everything else is locked to this origin; fonts come from Google Fonts.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
async function asset(req: Request, env: Env): Promise<Response> {
  if (!env.ASSETS || (req.method !== 'GET' && req.method !== 'HEAD')) throw new HttpError(404, 'not_found');
  const res = await env.ASSETS.fetch(req);
  const out = new Response(res.body, res);
  out.headers.set('content-security-policy', CSP);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('x-frame-options', 'DENY');
  out.headers.set('referrer-policy', 'no-referrer');
  out.headers.set('cache-control', 'no-cache');
  return out;
}

async function route(req: Request, env: Env, now: Date): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  if (path !== '/api' && !path.startsWith('/api/')) return asset(req, env);
  if (method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({ ok: true });
  }
  if (method !== 'GET' && method !== 'HEAD') assertSameOrigin(req, env);

  if (method === 'POST' && path === '/api/auth/login') {
    const r = await login(env.DB, await readJson(req), now);
    return json({ ok: true, mustChangePassword: r.mustChange }, 200, { 'set-cookie': sessionCookie(r.token, SESSION_HOURS * 3600) });
  }

  const session = await getSession(req, env, now);
  if (!session) throw new HttpError(401, 'unauthenticated');

  if (method === 'GET' && path === '/api/auth/me') return json(me(session));
  if (method === 'POST' && path === '/api/auth/logout') {
    await logout(env.DB, session, now);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }
  if (method === 'POST' && path === '/api/auth/password') return json(await changePassword(env.DB, session, await readJson(req), now));
  // A password set by an administrator must be replaced before anything else is allowed.
  if (session.mustChange) throw new HttpError(403, 'password_change_required');

  if (method === 'GET') {
    if (path === '/api/state') return json(await state(env.DB, session, now));
    if (path === '/api/users') return json(await listUsers(env.DB, session));
    if (path === '/api/settings/crest') return getCrest(env, session);
    if (path === '/api/funds/summary') {
      requirePerm(session, 'read');
      return json({ funds: await fundSummary(env.DB) });
    }
    if (path === '/api/integrity') {
      requirePerm(session, 'audit_read');
      return json({ issues: await integrityIssues(env.DB) });
    }
    if (path === '/api/audit-logs') {
      requirePerm(session, 'audit_read');
      return json({ logs: await auditLogs(env.DB) });
    }
    const list = path.match(/^\/api\/(income|expenses)$/);
    if (list) {
      requirePerm(session, 'read');
      return json({ items: await listTransactions(env.DB, COLLECTION[list[1]], url.searchParams.get('status')) });
    }
    throw new HttpError(404, 'not_found');
  }

  if (method === 'PUT') {
    if (path === '/api/settings') return json(await saveSettings(env.DB, session, await readJson(req), now));
    if (path === '/api/settings/crest') return json(await putCrest(env, session, req, now));
  }
  if (method === 'DELETE' && path === '/api/settings/crest') return json(await deleteCrest(env, session, now));

  if (method === 'POST') {
    let m: RegExpMatchArray | null;
    if (path === '/api/users') return json(await createUser(env.DB, session, await readJson(req), now), 201);
    if ((m = path.match(new RegExp(`^/api/users/${ID}/(enable|disable)$`)))) return json(await setActive(env.DB, session, m[1], m[2] === 'enable', now));
    if ((m = path.match(new RegExp(`^/api/users/${ID}/password$`)))) return json(await resetPassword(env.DB, session, m[1], await readJson(req), now));
    if (path === '/api/fiscal-years') return json(await createFiscalYear(env.DB, session, await readJson(req), now), 201);
    if ((m = path.match(new RegExp(`^/api/fiscal-years/${ID}/close$`)))) return json(await closeFiscalYear(env.DB, session, m[1], now));
    if (path === '/api/funds') return json(await addFund(env.DB, session, await readJson(req), now), 201);
    if ((m = path.match(new RegExp(`^/api/funds/${ID}/rename$`)))) return json(await renameFund(env.DB, session, m[1], await readJson(req), now));
    if (path === '/api/projects') return json(await addProject(env.DB, session, await readJson(req), now), 201);
    if ((m = path.match(new RegExp(`^/api/banks/${ID}/reconcile$`)))) return json(await reconcile(env.DB, session, m[1], await readJson(req), now), 201);

    const create = path.match(/^\/api\/(income|expenses)$/);
    if (create) {
      const out = await createTransaction(env.DB, COLLECTION[create[1]], session, await readJson(req), now);
      return json(out, 201);
    }
    const act = path.match(new RegExp(`^/api/(income|expenses)/${ID}/([a-z]+)$`));
    if (act) {
      const kind = COLLECTION[act[1]];
      const id = act[2];
      const action = act[3];
      if (!ACTIONS[action]?.includes(kind)) throw new HttpError(404, 'unknown_action');
      const body = await readJson(req);
      if (action === 'confirm' || action === 'pay') {
        return json(await post(env.DB, kind, session, id, idempotencyKey(req.headers.get('idempotency-key')), now));
      }
      if (action === 'reverse') {
        return json(await reverse(env.DB, kind, session, id, body.reason, idempotencyKey(req.headers.get('idempotency-key')), now));
      }
      return json(await advance(env.DB, kind, session, id, action, body.reason, now));
    }
  }
  throw new HttpError(404, 'not_found');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env, new Date());
    } catch (e) {
      return errorResponse(e);
    }
  },
};

export { route };
