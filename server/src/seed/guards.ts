/**
 * Safety checks for seeding shared databases (Neon / Render). Pure functions so
 * they are unit-tested without touching a database.
 */

/** The demo password that shipped in the public README — never allowed outside local dev. */
export const EXPOSED_DEMO_PASSWORDS = ['Password123!'];
export const MIN_SEED_PASSWORD_LENGTH = 12;

export interface DbTarget {
  host: string;
  database: string;
  /** Safe to print: no username, password or query string. */
  label: string;
}

/** Parses a Postgres URL into a printable target (never includes credentials). */
export function describeTarget(rawUrl: string): DbTarget {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error('DATABASE_URL must be a postgresql:// URL');
  const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || '(default)';
  return { host: url.hostname, database, label: `${url.hostname}/${database}` };
}

/**
 * Validates that a connection string points at Neon over TLS — and, when the
 * env file pins them, at the exact expected endpoint host and database.
 */
export function assertNeonTarget(
  rawUrl: string,
  expect: { host?: string; database?: string } = {},
): DbTarget {
  const target = describeTarget(rawUrl);
  const url = new URL(rawUrl);
  if (/^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0|db|postgres)$/i.test(target.host)) {
    throw new Error(`Refusing to seed: ${target.host} is a local database, not Neon`);
  }
  if (!target.host.endsWith('.neon.tech')) {
    throw new Error(`Refusing to seed: ${target.host} is not a Neon host (*.neon.tech)`);
  }
  const sslmode = url.searchParams.get('sslmode');
  if (!sslmode || !['require', 'verify-ca', 'verify-full'].includes(sslmode)) {
    throw new Error('Refusing to seed: the Neon connection string must use sslmode=require');
  }
  if (expect.host && target.host !== expect.host) {
    throw new Error(`Refusing to seed: host ${target.host} does not match NEON_EXPECTED_HOST (${expect.host})`);
  }
  if (expect.database && target.database !== expect.database) {
    throw new Error(`Refusing to seed: database "${target.database}" does not match NEON_EXPECTED_DATABASE ("${expect.database}")`);
  }
  return target;
}

/**
 * Decides which password the demo accounts get.
 * Local development may fall back to the documented password; any shared
 * database (production or Neon) requires an explicit, strong, non-public one.
 */
export function resolveSeedPassword(opts: { provided?: string; sharedDatabase: boolean; localDefault: string }): string {
  const provided = opts.provided?.trim() ? opts.provided : undefined;
  if (!opts.sharedDatabase) return provided ?? opts.localDefault;
  if (!provided) {
    throw new Error('SEED_DEMO_PASSWORD is required when seeding a production/Neon database (no default password is used).');
  }
  if (provided.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(`SEED_DEMO_PASSWORD must be at least ${MIN_SEED_PASSWORD_LENGTH} characters.`);
  }
  if (EXPOSED_DEMO_PASSWORDS.includes(provided)) {
    throw new Error('SEED_DEMO_PASSWORD must not be the public demo password from the README. Choose a new one.');
  }
  return provided;
}
