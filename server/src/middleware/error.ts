import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../utils/httpError';
import { logger } from '../config/logger';

/** 404 for unmatched routes. */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(HttpError.notFound('Route not found'));
}

/** Central error handler — the only place that formats error responses. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }
  // Translate the common Prisma errors instead of leaking them as 500s.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return res.status(409).json({ error: 'CONFLICT', message: `A record with this ${target} already exists` });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Record not found' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'A referenced record does not exist' });
    }
  }
  // Unknown/unexpected error: log details server-side, return a generic message.
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
}
