import { HttpError } from '../http.ts';

// PBKDF2-SHA256 through Web Crypto, which exists in Workers, Node and browsers.
// 100,000 iterations is the most the Workers runtime accepts for PBKDF2. That is below the
// current OWASP figure for PBKDF2-SHA256, so the choice is recorded in docs/DEPLOYMENT.md and
// compensated with a minimum length, account lockout and forced change of admin-set passwords.
// The stored string carries its own parameters, so the scheme can be raised or replaced later.
const ITER = 100_000;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

/** False for anything that is not a hash in our format (for example the DISABLED placeholder of the dev seed). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const p = stored.split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2-sha256') return false;
  const iter = Number(p[1]);
  if (!Number.isInteger(iter) || iter < 1 || iter > ITER) return false;
  let salt: Uint8Array, want: Uint8Array;
  try {
    salt = unb64(p[2]);
    want = unb64(p[3]);
  } catch {
    return false;
  }
  const got = await derive(password, salt, iter);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** A fixed hash used when the username does not exist, so both paths cost about the same time. */
export const DUMMY_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function checkPasswordPolicy(password: unknown, username: string): string {
  if (typeof password !== 'string') throw new HttpError(422, 'invalid_password');
  if (password.length < 10 || password.length > 128) throw new HttpError(422, 'password_too_short');
  if (password.toLowerCase().includes(username.toLowerCase())) throw new HttpError(422, 'password_contains_username');
  if (/^(.)\1+$/.test(password)) throw new HttpError(422, 'password_too_simple');
  return password;
}
