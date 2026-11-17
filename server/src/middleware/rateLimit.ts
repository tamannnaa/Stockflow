import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Integration tests fire many requests from one IP; limits are exercised manually, not in CI.
const skipInTests = () => env.nodeEnv === 'test';

/** Stricter limit on auth endpoints to slow brute-force / credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: { error: 'RATE_LIMITED', message: 'Too many attempts, please try again later' },
});

/** General API limiter. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  // JSON like every other error, so the client can show the message.
  message: { error: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute and try again.' },
});
