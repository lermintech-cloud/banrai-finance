import { HttpError } from '../http.ts';
import type { Env } from '../types.ts';

export const SESSION_COOKIE = 'banrai_session';

export interface Session {
  sessionId: string;
  userId: string;
  username: string;
  fullName: string;
  position: string | null;
  mustChange: boolean;
  roles: string[];
  permissions: Set<string>;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/**
 * Looks the session up from the database. The role/permission set always comes from the DB,
 * never from anything the client sends.
 */
export async function getSession(req: Request, env: Env, now: Date): Promise<Session | null> {
  const token = cookie(req, SESSION_COOKIE);
  if (!token || token.length < 20 || token.length > 200) return null;
  const hash = await sha256Hex(token);
  const u = await env.DB.prepare(
    `SELECT s.id AS sid, u.id AS id, u.username AS username, u.full_name AS name, u.position AS position, u.must_change_password AS mc
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2 AND u.is_active = 1`,
  )
    .bind(hash, now.toISOString())
    .first<{ sid: string; id: string; username: string; name: string; position: string | null; mc: number }>();
  if (!u) return null;
  const rows = await env.DB.prepare(
    `SELECT DISTINCT r.role_name AS role, p.code AS code
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ?1`,
  )
    .bind(u.id)
    .all<{ role: string; code: string | null }>();
  return {
    sessionId: u.sid,
    userId: u.id,
    username: u.username,
    fullName: u.name,
    position: u.position,
    mustChange: u.mc === 1,
    roles: [...new Set(rows.results.map((r) => r.role))],
    permissions: new Set(rows.results.map((r) => r.code).filter((c): c is string => !!c)),
  };
}

export function requirePerm(s: Session | null, code: string): Session {
  if (!s) throw new HttpError(401, 'unauthenticated');
  if (!s.permissions.has(code)) throw new HttpError(403, 'forbidden');
  return s;
}

/** CSRF guard for state-changing requests: the Origin header must be this site (or ALLOWED_ORIGIN). */
export function assertSameOrigin(req: Request, env: Env): void {
  const origin = req.headers.get('origin');
  const own = new URL(req.url).origin;
  if (!origin || (origin !== own && origin !== env.ALLOWED_ORIGIN)) throw new HttpError(403, 'bad_origin');
}

export const sessionCookie = (token: string, maxAge: number) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
