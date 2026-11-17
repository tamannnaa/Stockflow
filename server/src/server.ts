import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';

const app = createApp();

// Bind to HOST (default 0.0.0.0) and PORT — Render injects PORT at runtime.
const server = app.listen(env.port, env.host, () => {
  logger.info(`stockflow API listening on ${env.host}:${env.port} (${env.nodeEnv})`);
});

// Graceful shutdown — stop accepting connections, finish in-flight requests,
// close the DB pool. Force-exit if it takes too long (Render sends SIGTERM on deploys).
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down...`);
  const force = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
