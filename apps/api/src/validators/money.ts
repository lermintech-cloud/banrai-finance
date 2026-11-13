import { HttpError } from '../http.ts';

// Money comes in as a decimal STRING (never a JSON float) and leaves as integer satang.
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

export function bahtToSatang(v: unknown): number {
  if (typeof v !== 'string' || !MONEY.test(v)) throw new HttpError(422, 'invalid_amount');
  const [whole, frac = ''] = v.split('.');
  const satang = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(satang) || satang <= 0) throw new HttpError(422, 'invalid_amount');
  return satang;
}

/** Same as bahtToSatang but zero is allowed (opening balance, bank statement balance). */
export function bahtToSatangOrZero(v: unknown): number {
  if (typeof v !== 'string' || !MONEY.test(v)) throw new HttpError(422, 'invalid_amount');
  const [whole, frac = ''] = v.split('.');
  const satang = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(satang)) throw new HttpError(422, 'invalid_amount');
  return satang;
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Calendar date in Thailand (UTC+7) for an instant. Used for entry dates, so 00:00-07:00 does not slip a day. */
export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function text(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new HttpError(422, `invalid_${field}`);
  const s = v.replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw new HttpError(422, `invalid_${field}`);
  return s;
}
