import { z } from 'zod';

export const createOrderSchema = z.object({
  type: z.enum(['SALE', 'PURCHASE']),
  supplierId: z.number().int().positive().optional(),
  /** SALE only. Preferred way to attach a customer. */
  customerId: z.number().int().positive().optional(),
  /**
   * SALE only, kept for backward compatibility. When sent without customerId the
   * order is linked to the matching customer (or a new one is created).
   */
  customerName: z.string().trim().max(120).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, 'An order must contain at least one item')
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      'Each product can appear only once per order',
    ),
})
  .refine((o) => o.type === 'SALE' || o.customerId === undefined, {
    message: 'Purchase orders cannot have a customer',
    path: ['customerId'],
  });

export const listOrdersQuery = z.object({
  type: z.enum(['SALE', 'PURCHASE']).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FULFILLED', 'CANCELLED']).optional(),
  search: z.string().trim().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'FULFILLED', 'CANCELLED']),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
