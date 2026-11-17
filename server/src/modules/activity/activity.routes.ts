import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

/** Audit log (read-only). Entries are written by services via utils/activity.ts. */
const listQuery = z.object({
  entity: z.enum(['product', 'order', 'supplier', 'customer', 'category', 'user', 'auth']).optional(),
  userId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
type ListQuery = z.infer<typeof listQuery>;

const router = Router();
router.use(authenticate, authorize('ADMIN', 'MANAGER'));

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    const where: Prisma.ActivityLogWhereInput = {
      // Internal seed progress markers are bookkeeping, not user activity.
      NOT: { action: { startsWith: 'seed.step.' } },
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    const [total, data] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
    ]);
    res.json({ data, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } });
  }),
);

export default router;
