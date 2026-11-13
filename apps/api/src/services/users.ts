import { HttpError } from '../http.ts';
import { requirePerm } from '../middleware/auth.ts';
import type { Session } from '../middleware/auth.ts';
import { stmt } from '../repositories/db.ts';
import { text } from '../validators/money.ts';
import { checkPasswordPolicy, hashPassword } from './password.ts';

const id = (p: string) => `${p}-${crypto.randomUUID()}`;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const audit = (db: D1Database, s: Session, action: string, target: string, t: string, detail?: unknown) =>
  stmt(db, `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, new_value, created_at) VALUES (?1, ?2, ?3, 'user', ?4, ?5, ?6)`, [id('aud'), s.userId, action, target, detail === undefined ? null : JSON.stringify(detail), t]);

export async function listUsers(db: D1Database, s: Session) {
  requirePerm(s, 'user_admin');
  const users = await db
    .prepare(
      `SELECT u.id, u.username, u.full_name AS fullName, u.position, u.is_active AS active, u.must_change_password AS mustChange,
              (SELECT group_concat(r.role_key) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roleKeys
         FROM users u ORDER BY u.username`,
    )
    .all();
  const roles = await db.prepare('SELECT role_key AS key, role_name AS name, description FROM roles ORDER BY role_name').all();
  return { users: users.results.map((u: any) => ({ ...u, active: u.active === 1, mustChange: u.mustChange === 1, roleKeys: u.roleKeys ? String(u.roleKeys).split(',') : [] })), roles: roles.results };
}

/** The admin sets a temporary password; the user must change it at first login. */
export async function createUser(db: D1Database, s: Session, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'user_admin');
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!USERNAME.test(username)) throw new HttpError(422, 'invalid_username');
  const fullName = text(body.fullName, 'full_name', 1, 120);
  const position = body.position == null || body.position === '' ? null : text(body.position, 'position', 1, 120);
  const role = await stmt(db, 'SELECT id FROM roles WHERE role_key = ?1', [typeof body.roleKey === 'string' ? body.roleKey : '']).first<{ id: string }>();
  if (!role) throw new HttpError(422, 'invalid_role');
  const pw = checkPasswordPolicy(body.password, username);
  const uid = id('u');
  const t = now.toISOString();
  await db.batch([
    stmt(db, 'INSERT INTO users (id, username, password_hash, full_name, position, is_active, must_change_password, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, ?6)', [uid, username, await hashPassword(pw), fullName, position, t]),
    stmt(db, 'INSERT INTO user_roles (user_id, role_id) VALUES (?1, ?2)', [uid, role.id]),
    audit(db, s, 'user.create', uid, t, { username, role: body.roleKey }),
  ]);
  return { id: uid, username };
}

async function target(db: D1Database, uid: string) {
  const u = await stmt(db, 'SELECT id, username FROM users WHERE id = ?1', [uid]).first<{ id: string; username: string }>();
  if (!u) throw new HttpError(404, 'not_found');
  return u;
}

export async function setActive(db: D1Database, s: Session, uid: string, active: boolean, now: Date) {
  requirePerm(s, 'user_admin');
  const u = await target(db, uid);
  if (u.id === s.userId) throw new HttpError(409, 'cannot_change_self');
  const t = now.toISOString();
  await db.batch([
    stmt(db, 'UPDATE users SET is_active = ?2, updated_at = ?3 WHERE id = ?1', [uid, active ? 1 : 0, t]),
    stmt(db, 'UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL', [uid, t]),
    audit(db, s, active ? 'user.enable' : 'user.disable', uid, t),
  ]);
  return { id: uid, active };
}

export async function resetPassword(db: D1Database, s: Session, uid: string, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'user_admin');
  const u = await target(db, uid);
  if (u.id === s.userId) throw new HttpError(409, 'cannot_change_self');
  const pw = checkPasswordPolicy(body.password, u.username);
  const t = now.toISOString();
  await db.batch([
    stmt(db, 'UPDATE users SET password_hash = ?2, must_change_password = 1, updated_at = ?3 WHERE id = ?1', [uid, await hashPassword(pw), t]),
    stmt(db, 'UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL', [uid, t]),
    stmt(db, 'DELETE FROM login_attempts WHERE username_key = ?1', [u.username.toLowerCase()]),
    audit(db, s, 'user.reset_password', uid, t),
  ]);
  return { id: uid };
}
