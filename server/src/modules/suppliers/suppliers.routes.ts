import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { logActivity } from '../../utils/activity';
import { parseId } from '../../utils/params';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(200).optional(),
});
const updateSchema = schema.partial();

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } }, orders: true } } },
    });
    res.json({ data: suppliers });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const supplier = await prisma.supplier.findUniqueOrThrow({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, sku: true, name: true, quantityInStock: true, reorderLevel: true, costPrice: true },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true },
        },
      },
    });
    res.json({ data: supplier });
  }),
);

router.post(
  '/',
  authorize('ADMIN', 'MANAGER'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.create({ data: req.body });
    await logActivity(prisma, {
      userId: req.user!.sub,
      action: 'supplier.created',
      entity: 'supplier',
      entityId: supplier.id,
      metadata: { name: supplier.name },
    });
    res.status(201).json({ data: supplier });
  }),
);

router.patch(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const supplier = await prisma.supplier.update({ where: { id }, data: req.body });
    await logActivity(prisma, {
      userId: req.user!.sub,
      action: 'supplier.updated',
      entity: 'supplier',
      entityId: id,
      metadata: { fields: Object.keys(req.body) },
    });
    res.json({ data: supplier });
  }),
);

export default router;
