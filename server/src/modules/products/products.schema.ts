import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(500).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  unitPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative(),
  quantityInStock: z.number().int().nonnegative().default(0),
  reorderLevel: z.number().int().nonnegative().default(10),
});

// `.partial()` keeps the defaults out of PATCH bodies so omitted fields stay untouched.
export const updateProductSchema = createProductSchema
  .extend({
    quantityInStock: z.number().int().nonnegative(),
    reorderLevel: z.number().int().nonnegative(),
  })
  .partial();

export const listProductsQuery = z.object({
  search: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  /** in = above reorder level · low = 1..reorder level · out = 0 */
  stock: z.enum(['in', 'low', 'out']).optional(),
  sort: z.enum(['name', 'sku', 'unitPrice', 'quantityInStock', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const adjustStockSchema = z.object({
  changeQty: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Change cannot be zero'),
  reason: z.enum(['ADJUSTMENT', 'RETURN']).default('ADJUSTMENT'),
  note: z.string().max(200).optional(),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuery>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type PaginationQuery = z.infer<typeof paginationQuery>;
