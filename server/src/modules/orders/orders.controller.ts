import { Request, Response } from 'express';
import { ordersService } from './orders.service';
import { parseId } from '../../utils/params';
import { HttpError } from '../../utils/httpError';

export const ordersController = {
  async create(req: Request, res: Response) {
    // Purchases add stock, so they follow the same rule as stock adjustments: MANAGER+.
    if (req.body.type === 'PURCHASE' && req.user!.role === 'STAFF') {
      throw HttpError.forbidden('Only managers and admins can create purchase orders');
    }
    const order = await ordersService.create(req.user!.sub, req.body);
    res.status(201).json({ data: order });
  },
  async list(req: Request, res: Response) {
    res.json(await ordersService.list(req.query as never));
  },
  async getOne(req: Request, res: Response) {
    res.json({ data: await ordersService.getById(parseId(req.params.id)) });
  },
  async updateStatus(req: Request, res: Response) {
    const order = await ordersService.updateStatus(parseId(req.params.id), req.body.status, req.user!.sub);
    res.json({ data: order });
  },
};
