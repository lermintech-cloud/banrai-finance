// Minimal shared types. D1Database / R2Bucket / Fetcher come from @cloudflare/workers-types (see tsconfig.json).

export interface Env {
  DB: D1Database;
  /** Optional private R2 bucket. Without it, the crest image is kept in the D1 table stored_files. */
  FILES?: R2Bucket;
  /** Static files of the web app (apps/web/public). The Worker adds security headers on the way out. */
  ASSETS?: Fetcher;
  /** Optional extra allowed Origin for state-changing requests. Same-origin is always allowed. */
  ALLOWED_ORIGIN?: string;
}

export type Kind = 'income' | 'expense';
