import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import { logActivity } from '../../utils/activity';
import { parseId } from '../../utils/params';

const schema = z.object({ name: z.string().trim().min(2).max(60), description: z.string().max(300).optional() });

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    res.json({ data: categories });
  }),
);

router.post(
  '/',
  authorize('ADMIN', 'MANAGER'),
  validate(schema),
  asyncHandler(async (req, res) => {
    const exists = await prisma.category.findUnique({ where: { name: req.body.name } });
    if (exists) throw HttpError.conflict('NAME_TAKEN', 'Category already exists');
    const category = await prisma.category.create({ data: req.body });
    await logActivity(prisma, {
      userId: req.user!.sub,
      action: 'category.created',
      entity: 'category',
      entityId: category.id,
      metadata: { name: category.name },
    });
    res.status(201).json({ data: category });
  }),
);

router.patch(
  '/:id',
  authorize('ADMIN', 'MANAGER'),
  validate(schema.partial()),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const category = await prisma.category.update({ where: { id }, data: req.body });
    await logActivity(prisma, {
      userId: req.user!.sub,
      action: 'category.updated',
      entity: 'category',
      entityId: id,
      metadata: { fields: Object.keys(req.body) },
    });
    res.json({ data: category });
  }),
);

export default router;
