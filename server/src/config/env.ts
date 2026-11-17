import 'dotenv/config';

/**
 * Centralized, validated environment config.
 * Fails fast at startup if something required is missing or unsafe — the API
 * never starts with placeholder secrets or a localhost CORS origin in production.
 */
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';
const problems: string[] = [];

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    problems.push(`Missing required environment variable: ${key}`);
    return '';
  }
  return value.trim();
}

function secret(key: string): string {
  const value = required(key);
  if (isProd && value) {
    if (value.length < 32) problems.push(`${key} must be at least 32 characters in production (use: openssl rand -hex 32)`);
    if (/replace|change-?me|secret|example/i.test(value)) problems.push(`${key} looks like a placeholder value`);
  }
  return value;
}

function bool(key: string, fallback: boolean) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

// FRONTEND_URL is accepted as an alias of CLIENT_ORIGIN (comma-separated list allowed).
const originSource = process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || (isProd ? '' : 'http://localhost:5173');
const clientOrigins = originSource
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
if (isProd && clientOrigins.length === 0) {
  problems.push('CLIENT_ORIGIN (or FRONTEND_URL) is required in production — set it to your deployed frontend URL');
}
if (isProd && clientOrigins.some((o) => /localhost|127\.0\.0\.1/.test(o))) {
  problems.push('CLIENT_ORIGIN must not point at localhost in production');
}

const accessSecret = secret('JWT_ACCESS_SECRET');
const refreshSecret = secret('JWT_REFRESH_SECRET');
if (accessSecret && accessSecret === refreshSecret) {
  problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
}

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port <= 0) problems.push('PORT must be a positive integer');

export const env = {
  nodeEnv,
  isProd,
  port,
  /** Bind address. 0.0.0.0 so the API is reachable inside containers / on Render. */
  host: process.env.HOST ?? '0.0.0.0',
  clientOrigins,
  databaseUrl: required('DATABASE_URL'),
  /**
   * Number of reverse proxies in front of the app (Render = 1, Vercel rewrite → Render = 2).
   * Needed so rate limiting and logs see the real client IP.
   */
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProd ? 1 : 0)),
  /**
   * Public self-registration. Off by default in production: otherwise anyone could
   * create an account, and on an empty database the first registrant becomes ADMIN.
   */
  allowRegistration: bool('ALLOW_REGISTRATION', !isProd),
  jwt: {
    accessSecret,
    refreshSecret,
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  },
};

if (problems.length) {
  throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
}
