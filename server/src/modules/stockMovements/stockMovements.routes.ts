import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

/**
 * Read access to the append-only stock ledger (written by orders and stock
 * adjustments). There are deliberately no write endpoints here.
 */
const listQuery = z.object({
  productId: z.coerce.number().int().positive().optional(),
  reason: z.enum(['SALE', 'PURCHASE', 'ADJUSTMENT', 'RETURN']).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
type ListQuery = z.infer<typeof listQuery>;

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    const where: Prisma.StockMovementWhereInput = {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.reason ? { reason: q.reason } : {}),
      ...(q.search
        ? {
            product: {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { sku: { contains: q.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          product: { select: { id: true, sku: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          order: { select: { id: true, orderNumber: true, type: true } },
        },
      }),
    ]);
    res.json({ data, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } });
  }),
);

export default router;
