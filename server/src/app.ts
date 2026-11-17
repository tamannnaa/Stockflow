import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
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

  app.use(helmet()); // secure HTTP headers
  app.use(
    cors({
      origin: env.clientOrigins, // allow-list only our frontend(s)
      credentials: true, // needed for the refresh-token cookie
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  // Never write bearer tokens or refresh cookies into logs.
  app.use(pinoHttp({ logger, redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
