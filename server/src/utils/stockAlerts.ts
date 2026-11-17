import type { Prisma } from '@prisma/client';

/**
 * Creates a LOW_STOCK notification only when a product *crosses* its reorder
 * level (was above, now at/below). Avoids a duplicate alert on every sale.
 */
export async function notifyIfCrossedReorder(
  tx: Prisma.TransactionClient,
  productId: number,
  previousQty: number,
) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) return;
  const crossed = previousQty > product.reorderLevel && product.quantityInStock <= product.reorderLevel;
  if (!crossed) return;
  await tx.notification.create({
    data: {
      type: product.quantityInStock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      message:
        product.quantityInStock <= 0
          ? `"${product.name}" is out of stock`
          : `"${product.name}" is low on stock (${product.quantityInStock} left)`,
    },
  });
}
