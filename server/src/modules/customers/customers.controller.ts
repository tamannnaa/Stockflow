import { Request, Response } from 'express';
import { customersService } from './customers.service';
import { parseId } from '../../utils/params';

export const customersController = {
  async list(req: Request, res: Response) {
    res.json(await customersService.list(req.query as never));
  },
  async getOne(req: Request, res: Response) {
    res.json({ data: await customersService.getById(parseId(req.params.id)) });
  },
  async create(req: Request, res: Response) {
    res.status(201).json({ data: await customersService.create(req.body, req.user!.sub) });
  },
  async update(req: Request, res: Response) {
    res.json({ data: await customersService.update(parseId(req.params.id), req.body, req.user!.sub) });
  },
  async archive(req: Request, res: Response) {
    res.json({ data: await customersService.setArchived(parseId(req.params.id), true, req.user!.sub) });
  },
  async restore(req: Request, res: Response) {
    res.json({ data: await customersService.setArchived(parseId(req.params.id), false, req.user!.sub) });
  },
  async remove(req: Request, res: Response) {
    await customersService.remove(parseId(req.params.id), req.user!.sub);
    res.status(204).send();
  },
};
