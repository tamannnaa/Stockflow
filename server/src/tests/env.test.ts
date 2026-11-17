import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Startup validation of production configuration. env.ts validates on import,
 * so each case loads a fresh copy of the module with a controlled environment.
 */
const STRONG_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9';
const STRONG_B = 'f9e8d7c6b5a40918273645f6e7d8c9b0f9e8d7c6b5a40918273645f6e7d8c9b0';
const saved = { ...process.env };

async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...saved, ...vars };
  return import('../config/env');
}

afterEach(() => {
  process.env = { ...saved };
  vi.resetModules();
});

const prod = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db.example:5432/app?sslmode=require',
  JWT_ACCESS_SECRET: STRONG_A,
  JWT_REFRESH_SECRET: STRONG_B,
  CLIENT_ORIGIN: 'https://stockflow.vercel.app',
};

describe('production environment validation', () => {
  it('accepts a complete, strong production config', async () => {
    const { env } = await loadEnv(prod);
    expect(env.isProd).toBe(true);
    expect(env.clientOrigins).toEqual(['https://stockflow.vercel.app']);
    expect(env.allowRegistration).toBe(false); // off by default in production
    expect(env.trustProxy).toBe(1);
    expect(env.host).toBe('0.0.0.0');
  });

  it('accepts FRONTEND_URL as an alias and strips trailing slashes', async () => {
    const { env } = await loadEnv({ ...prod, CLIENT_ORIGIN: '', FRONTEND_URL: 'https://a.example/, https://b.example' });
    expect(env.clientOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it.each([
    ['placeholder secrets', { JWT_ACCESS_SECRET: 'replace-with-a-long-random-secret-value-0000' }, /placeholder/],
    ['short secrets', { JWT_REFRESH_SECRET: 'tooshort' }, /at least 32/],
    ['identical secrets', { JWT_REFRESH_SECRET: STRONG_A }, /must be different/],
    ['missing CORS origin', { CLIENT_ORIGIN: '' }, /CLIENT_ORIGIN/],
    ['localhost CORS origin', { CLIENT_ORIGIN: 'http://localhost:5173' }, /localhost/],
    ['missing DATABASE_URL', { DATABASE_URL: '' }, /DATABASE_URL/],
  ])('rejects %s', async (_label, override, message) => {
    await expect(loadEnv({ ...prod, ...override })).rejects.toThrow(message);
  });
});
