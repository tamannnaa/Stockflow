import { describe, expect, it } from 'vitest';
import { assertNeonTarget, describeTarget, resolveSeedPassword } from '../seed/guards';

const NEON = 'postgresql://neondb_owner:s3cr3t@ep-square-wave-abc123.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

describe('seed target guards', () => {
  it('describes a target without leaking credentials', () => {
    const t = describeTarget(NEON);
    expect(t).toEqual({ host: 'ep-square-wave-abc123.c-2.ap-southeast-1.aws.neon.tech', database: 'neondb', label: 'ep-square-wave-abc123.c-2.ap-southeast-1.aws.neon.tech/neondb' });
    expect(JSON.stringify(t)).not.toMatch(/s3cr3t|neondb_owner/);
  });

  it('accepts a Neon URL over TLS, optionally pinned to host + database', () => {
    expect(assertNeonTarget(NEON).database).toBe('neondb');
    expect(() =>
      assertNeonTarget(NEON, { host: 'ep-square-wave-abc123.c-2.ap-southeast-1.aws.neon.tech', database: 'neondb' }),
    ).not.toThrow();
  });

  it.each([
    ['local Docker', 'postgresql://stockflow:stockflow@localhost:5432/stockflow', /local database/],
    ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/x', /local database/],
    ['non-Neon host', 'postgresql://u:p@db.example.com:5432/x?sslmode=require', /not a Neon host/],
    ['Neon without TLS', NEON.replace('sslmode=require', 'sslmode=disable'), /sslmode=require/],
    ['not a URL', 'nope', /valid URL/],
    ['wrong protocol', 'mysql://u:p@x.neon.tech/db?sslmode=require', /postgresql/],
  ])('rejects %s', (_label, url, message) => {
    expect(() => assertNeonTarget(url)).toThrow(message);
  });

  it('rejects a different Neon endpoint or database than the pinned one', () => {
    expect(() => assertNeonTarget(NEON, { host: 'ep-other-111.c-2.ap-southeast-1.aws.neon.tech' })).toThrow(/NEON_EXPECTED_HOST/);
    expect(() => assertNeonTarget(NEON, { database: 'otherdb' })).toThrow(/NEON_EXPECTED_DATABASE/);
  });
});

describe('seed password policy', () => {
  const local = { sharedDatabase: false, localDefault: 'Password123!' };
  const shared = { sharedDatabase: true, localDefault: 'Password123!' };

  it('local development may use the documented default', () => {
    expect(resolveSeedPassword(local)).toBe('Password123!');
    expect(resolveSeedPassword({ ...local, provided: 'my-local-pass' })).toBe('my-local-pass');
  });

  it('shared/production databases require an explicit, strong, non-public password', () => {
    expect(() => resolveSeedPassword(shared)).toThrow(/required/);
    expect(() => resolveSeedPassword({ ...shared, provided: '   ' })).toThrow(/required/);
    expect(() => resolveSeedPassword({ ...shared, provided: 'short' })).toThrow(/at least 12/);
    expect(() => resolveSeedPassword({ ...shared, provided: 'Password123!' })).toThrow(/public demo password/);
    expect(resolveSeedPassword({ ...shared, provided: 'Orchid-Ledger-2026!' })).toBe('Orchid-Ledger-2026!');
  });
});
