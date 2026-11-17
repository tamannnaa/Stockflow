import { Request, Response } from 'express';
import { productsService } from './products.service';
import { parseId } from '../../utils/params';

export const productsController = {
  async list(req: Request, res: Response) {
    res.json(await productsService.list(req.query as never));
  },
  async lowStock(_req: Request, res: Response) {
    res.json({ data: await productsService.lowStock() });
  },
  async getOne(req: Request, res: Response) {
    res.json({ data: await productsService.getById(parseId(req.params.id)) });
  },
  async create(req: Request, res: Response) {
    res.status(201).json({ data: await productsService.create(req.body, req.user!.sub) });
  },
  async update(req: Request, res: Response) {
    res.json({ data: await productsService.update(parseId(req.params.id), req.body, req.user!.sub) });
  },
  async remove(req: Request, res: Response) {
    await productsService.remove(parseId(req.params.id), req.user!.sub);
    res.status(204).send();
  },
  async adjust(req: Request, res: Response) {
    res.json({ data: await productsService.adjust(parseId(req.params.id), req.body, req.user!.sub) });
  },
  async movements(req: Request, res: Response) {
    res.json(await productsService.movements(parseId(req.params.id), req.query as never));
  },
};
