import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { apiLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import productRoutes from './modules/products/products.routes';
import orderRoutes from './modules/orders/orders.routes';
import categoryRoutes from './modules/categories/categories.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import userRoutes from './modules/users/users.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import stockMovementRoutes from './modules/stockMovements/stockMovements.routes';
import activityRoutes from './modules/activity/activity.routes';
import customerRoutes from './modules/customers/customers.routes';

export function createApp() {
  const app = express();

  // Behind Render's (and optionally Vercel's) proxy: trust X-Forwarded-* from that
  // many hops so rate limiting keys on the real client IP and req.secure is correct.
  if (env.trustProxy > 0) app.set('trust proxy', env.trustProxy);

  app.use(helmet()); // secure HTTP headers
  app.use(
    cors({
      origin: env.clientOrigins, // allow-list only our frontend(s)
      credentials: true, // needed for the refresh-token cookie
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  // Never write bearer tokens or refresh cookies into logs. Health probes are not logged.
  app.use(
    pinoHttp({
      logger,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (req) => req.url?.includes('health') ?? false },
    }),
  );

  // Liveness: process is up (no DB call — cheap, never flaps).
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  // Readiness: process + database. Use this as Render's health check path.
  app.get(['/api/health', '/api/v1/health'], async (_req, res) => {
    const startedAt = Date.now();
    const database = await Promise.race([
      prisma.$queryRaw`SELECT 1`.then(() => 'up' as const),
      new Promise<'down'>((resolve) => setTimeout(() => resolve('down'), 3000)),
    ]).catch(() => 'down' as const);
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1', apiLimiter);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/categories', categoryRoutes);
  app.use('/api/v1/suppliers', supplierRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/stock-movements', stockMovementRoutes);
  app.use('/api/v1/activity', activityRoutes);
  app.use('/api/v1/customers', customerRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
