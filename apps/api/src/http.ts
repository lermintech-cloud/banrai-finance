export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

const BASE_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...extra } });
}

/**
 * Turns a database error into an HTTP error. The database enforces the money rules
 * (see database/migrations/0003_integrity.sql), so its error codes are part of the API contract.
 * For unexpected (500) errors a short excerpt of the message is returned as `detail`, so a problem on a
 * live deployment can be diagnosed from a screenshot. It holds SQL object names at most, never row data
 * or credentials, and the caller is already past the session check for everything except login.
 */
export function fromDbError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes('insufficient_funds')) return new HttpError(409, 'insufficient_funds');
  if (m.includes('invalid_status_transition')) return new HttpError(409, 'invalid_status_transition');
  if (m.includes('immutable_after_post')) return new HttpError(409, 'immutable_after_post');
  if (m.includes('fiscal_year_closed')) return new HttpError(409, 'fiscal_year_closed');
  if (m.includes('project_fund_mismatch')) return new HttpError(422, 'project_fund_mismatch');
  if (m.includes('ck_exp_sod_') || m.includes('ck_inc_sod_')) return new HttpError(403, 'separation_of_duties');
  if (m.includes('UNIQUE constraint failed')) return new HttpError(409, 'duplicate');
  if (m.includes('FOREIGN KEY constraint failed')) return new HttpError(422, 'invalid_reference');
  if (m.includes('CHECK constraint failed') || m.includes('NOT NULL constraint failed')) return new HttpError(422, 'constraint_failed');
  return new HttpError(500, 'internal', m);
}

export function errorResponse(e: unknown): Response {
  const err = fromDbError(e);
  if (err.status >= 500) console.error('api_error', e instanceof Error ? e.message : String(e));
  if (err.status >= 500) return json({ error: err.code, detail: String(e instanceof Error ? e.message : e).replace(/\s+/g, ' ').slice(0, 300) }, err.status);
  return json({ error: err.code }, err.status);
}
