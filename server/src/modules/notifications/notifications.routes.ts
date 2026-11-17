import { Router } from 'express';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/params';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [data, unread] = await Promise.all([
      prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { isRead: false } }),
    ]);
    res.json({ data, unread });
  }),
);

router.patch(
  '/read-all',
  asyncHandler(async (_req, res) => {
    const result = await prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    res.json({ updated: result.count });
  }),
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const data = await prisma.notification.update({
      where: { id: parseId(req.params.id) },
      data: { isRead: true },
    });
    res.json({ data });
  }),
);

export default router;
