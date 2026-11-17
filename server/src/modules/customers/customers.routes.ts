import { Router } from 'express';
import { customersController } from './customers.controller';
import { customerSchema, listCustomersQuery } from './customers.schema';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';

const router = Router();
router.use(authenticate);

// Any signed-in user can view, create and edit customers: staff record sales and
// need to add a customer at the till. Archiving and deleting are MANAGER+.
router.get('/', validate(listCustomersQuery, 'query'), asyncHandler(customersController.list));
router.get('/:id', asyncHandler(customersController.getOne));
router.post('/', validate(customerSchema), asyncHandler(customersController.create));
router.put('/:id', validate(customerSchema), asyncHandler(customersController.update));
router.post('/:id/archive', authorize('ADMIN', 'MANAGER'), asyncHandler(customersController.archive));
router.post('/:id/restore', authorize('ADMIN', 'MANAGER'), asyncHandler(customersController.restore));
router.delete('/:id', authorize('ADMIN', 'MANAGER'), asyncHandler(customersController.remove));

export default router;
