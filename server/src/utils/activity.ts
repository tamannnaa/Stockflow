import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ActivityEntry {
  userId?: number;
  action: string; // e.g. "product.updated", "order.status_changed"
  entity?: string; // e.g. "product", "order"
  entityId?: number;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Appends a row to the audit log. Accepts either the shared client or a
 * transaction client, so the log entry commits/rolls back with the change it describes.
 */
export async function logActivity(db: Db, entry: ActivityEntry) {
  await db.activityLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}
