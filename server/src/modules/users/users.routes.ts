import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { HttpError } from '../../utils/httpError';
import { logActivity } from '../../utils/activity';
import { parseId } from '../../utils/params';

const updateSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('STAFF'),
});

const router = Router();
// User management is ADMIN-only.
router.use(authenticate, authorize('ADMIN'));

const publicSelect = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true };

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await prisma.user.findMany({ select: publicSelect, orderBy: { createdAt: 'desc' } }) });
  }),
);

/** Admin-created accounts (the public /auth/register would log the admin in as the new user). */
router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const exists = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (exists) throw HttpError.conflict('EMAIL_TAKEN', 'Email is already registered');
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const user = await prisma.user.create({
      data: { name: req.body.name, email: req.body.email, role: req.body.role, passwordHash },
      select: publicSelect,
    });
    await logActivity(prisma, {
      userId: req.user!.sub,
      action: 'user.created',
      entity: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });
    res.status(201).json({ data: user });
  }),
);

router.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    // Guard against an admin locking themselves (and possibly everyone) out.
    if (id === req.user!.sub && (req.body.isActive === false || (req.body.role && req.body.role !== 'ADMIN'))) {
      throw HttpError.badRequest('You cannot deactivate or demote your own account');
    }
    const user = await prisma.user.update({
      where: { id },
      data: req.body,
      select: publicSelect,
    });
    await logActivity(prisma, {
      userId: req.user!.sub,
      action: 'user.updated',
      entity: 'user',
      entityId: id,
      metadata: { email: user.email, ...req.body },
    });
    res.json({ data: user });
  }),
);

export default router;
