import { HttpError } from '../http.ts';
import { sha256Hex } from '../middleware/auth.ts';
import type { Session } from '../middleware/auth.ts';
import { stmt } from '../repositories/db.ts';
import { DUMMY_HASH, checkPasswordPolicy, hashPassword, verifyPassword } from './password.ts';

export const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const id = (p: string) => `${p}-${crypto.randomUUID()}`;

function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns the session token for the cookie. The same error is used for "no such user" and "wrong password". */
export async function login(db: D1Database, body: Record<string, unknown>, now: Date): Promise<{ token: string; mustChange: boolean }> {
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || username.length > 60 || !password || password.length > 128) throw new HttpError(401, 'invalid_credentials');
  const t = now.toISOString();
  const att = await stmt(db, 'SELECT failed_count AS n, locked_until AS lu FROM login_attempts WHERE username_key = ?1', [username]).first<{ n: number; lu: string | null }>();
  if (att?.lu && att.lu > t) throw new HttpError(429, 'account_locked');
  const u = await stmt(db, 'SELECT id, password_hash AS h, is_active AS a, must_change_password AS mc FROM users WHERE lower(username) = ?1', [username]).first<{ id: string; h: string; a: number; mc: number }>();
  const ok = (await verifyPassword(password, u ? u.h : DUMMY_HASH)) && !!u && u.a === 1;
  if (!ok) {
    const n = (att?.lu && att.lu <= t ? 0 : (att?.n ?? 0)) + 1;
    const lock = n >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null;
    await db.batch([
      stmt(db, `INSERT INTO login_attempts (username_key, failed_count, locked_until, last_failed_at) VALUES (?1, ?2, ?3, ?4)
                ON CONFLICT(username_key) DO UPDATE SET failed_count = ?2, locked_until = ?3, last_failed_at = ?4`, [username, lock ? 0 : n, lock, t]),
      stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, created_at) VALUES (?1, ?2, ?3, 'auth', ?4, ?5)`, [id('aud'), u ? u.id : null, lock ? 'auth.locked' : 'auth.login_failed', username, t]),
    ]);
    throw new HttpError(401, 'invalid_credentials');
  }
  const token = newToken();
  await db.batch([
    stmt(db, 'DELETE FROM login_attempts WHERE username_key = ?1', [username]),
    stmt(db, 'DELETE FROM sessions WHERE user_id = ?1 AND (expires_at <= ?2 OR revoked_at IS NOT NULL)', [u!.id, t]),
    stmt(db, 'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)', [id('ses'), u!.id, await sha256Hex(token), t, new Date(now.getTime() + SESSION_HOURS * 3600000).toISOString()]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, created_at) VALUES (?1, ?2, 'auth.login', 'auth', ?2, ?3)`, [id('aud'), u!.id, t]),
  ]);
  return { token, mustChange: u!.mc === 1 };
}

export async function logout(db: D1Database, s: Session, now: Date) {
  const t = now.toISOString();
  await db.batch([
    stmt(db, 'UPDATE sessions SET revoked_at = ?2 WHERE id = ?1', [s.sessionId, t]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, created_at) VALUES (?1, ?2, 'auth.logout', 'auth', ?2, ?3)`, [id('aud'), s.userId, t]),
  ]);
}

export function me(s: Session) {
  return { id: s.userId, username: s.username, fullName: s.fullName, position: s.position, roles: s.roles, permissions: [...s.permissions].sort(), mustChangePassword: s.mustChange };
}

/** Change own password. Every other session of the user is revoked. */
export async function changePassword(db: D1Database, s: Session, body: Record<string, unknown>, now: Date) {
  const cur = await stmt(db, 'SELECT password_hash AS h FROM users WHERE id = ?1', [s.userId]).first<{ h: string }>();
  if (!cur || typeof body.currentPassword !== 'string' || !(await verifyPassword(body.currentPassword, cur.h))) throw new HttpError(403, 'wrong_password');
  const pw = checkPasswordPolicy(body.newPassword, s.username);
  if (pw === body.currentPassword) throw new HttpError(422, 'password_unchanged');
  const t = now.toISOString();
  await db.batch([
    stmt(db, 'UPDATE users SET password_hash = ?2, must_change_password = 0, updated_at = ?3 WHERE id = ?1', [s.userId, await hashPassword(pw), t]),
    stmt(db, 'UPDATE sessions SET revoked_at = ?3 WHERE user_id = ?1 AND id <> ?2 AND revoked_at IS NULL', [s.userId, s.sessionId, t]),
    stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, created_at) VALUES (?1, ?2, 'auth.password_changed', 'user', ?2, ?3)`, [id('aud'), s.userId, t]),
  ]);
  return { ok: true };
}
