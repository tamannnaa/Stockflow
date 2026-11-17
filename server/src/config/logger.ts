import pino from 'pino';
import { env } from './env';

// Pretty logs in dev, structured JSON in production.
export const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : env.isProd ? 'info' : 'debug',
  transport: env.isProd
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});
