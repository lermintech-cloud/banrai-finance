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
         FROM users u WHERE u.username NOT LIKE 'deleted-%' ORDER BY u.username`,
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

/**
 * Edit an account: full name, position and role. An administrator may correct their own name and position,
 * but not their own role (so the last administrator cannot lock everyone out by accident).
 */
export async function updateUser(db: D1Database, s: Session, uid: string, body: Record<string, unknown>, now: Date) {
  requirePerm(s, 'user_admin');
  await target(db, uid);
  const fullName = text(body.fullName, 'full_name', 1, 120);
  const position = body.position == null || body.position === '' ? null : text(body.position, 'position', 1, 120);
  const t = now.toISOString();
  const batch = [stmt(db, 'UPDATE users SET full_name = ?2, position = ?3, updated_at = ?4 WHERE id = ?1', [uid, fullName, position, t])];
  let roleKey: string | null = null;
  if (typeof body.roleKey === 'string' && body.roleKey !== '') {
    const role = await stmt(db, 'SELECT id FROM roles WHERE role_key = ?1', [body.roleKey]).first<{ id: string }>();
    if (!role) throw new HttpError(422, 'invalid_role');
    const cur = await stmt(db, 'SELECT r.role_key AS k FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?1', [uid]).all<{ k: string }>();
    const same = cur.results.length === 1 && cur.results[0].k === body.roleKey;
    if (!same) {
      if (uid === s.userId) throw new HttpError(409, 'cannot_change_self');
      roleKey = body.roleKey;
      batch.push(stmt(db, 'DELETE FROM user_roles WHERE user_id = ?1', [uid]), stmt(db, 'INSERT INTO user_roles (user_id, role_id) VALUES (?1, ?2)', [uid, role.id]));
    }
  }
  batch.push(audit(db, s, 'user.update', uid, t, { fullName, position, ...(roleKey ? { role: roleKey } : {}) }));
  await db.batch(batch);
  return { id: uid };
}

/**
 * Delete an account. One that was never used (no sign-in, no transactions, nothing in the audit log) is removed.
 * One that was used must stay for the history, so it is retired instead: signed out, unable to sign in, its roles
 * removed, its username freed for reuse and hidden from the list. Its name still shows in the audit trail.
 */
export async function deleteUser(db: D1Database, s: Session, uid: string, now: Date) {
  requirePerm(s, 'user_admin');
  const u = await target(db, uid);
  if (u.id === s.userId) throw new HttpError(409, 'cannot_change_self');
  const t = now.toISOString();
  try {
    await db.batch([
      stmt(db, 'DELETE FROM sessions WHERE user_id = ?1', [uid]),
      stmt(db, 'DELETE FROM user_roles WHERE user_id = ?1', [uid]),
      stmt(db, 'DELETE FROM login_attempts WHERE username_key = ?1', [u.username.toLowerCase()]),
      stmt(db, 'DELETE FROM users WHERE id = ?1', [uid]),
      audit(db, s, 'user.delete', uid, t, { username: u.username, mode: 'deleted' }),
    ]);
    return { id: uid, mode: 'deleted' };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.includes('FOREIGN KEY')) throw e;
  }
  await db.batch([
    stmt(db, `UPDATE users SET is_active = 0, password_hash = 'RETIRED', username = 'deleted-' || substr(id, 1, 30), updated_at = ?2 WHERE id = ?1`, [uid, t]),
    stmt(db, 'UPDATE sessions SET revoked_at = ?2 WHERE user_id = ?1 AND revoked_at IS NULL', [uid, t]),
    stmt(db, 'DELETE FROM user_roles WHERE user_id = ?1', [uid]),
    stmt(db, 'DELETE FROM login_attempts WHERE username_key = ?1', [u.username.toLowerCase()]),
    audit(db, s, 'user.delete', uid, t, { username: u.username, mode: 'retired' }),
  ]);
  return { id: uid, mode: 'retired' };
}
