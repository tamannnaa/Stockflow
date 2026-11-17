-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customer_id" INTEGER;

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Data backfill (hand-written; non-destructive)
-- Before this migration, customers existed only as orders.customer_name on SALE
-- orders. Create one customer per distinct name and link those orders.
--   • Names are matched trimmed + case-insensitively ("Acme" = " acme ").
--   • The most frequently used spelling becomes the customer's name (ties → most
--     recent); created_at is the date of their first order ("customer since").
--   • Cancelled orders are linked too, so history is preserved (stats exclude them).
--   • Walk-in sales (no name) and PURCHASE orders are left without a customer.
--   • orders.customer_name is NOT modified — it remains the historical snapshot.
-- ─────────────────────────────────────────────────────────────────────────────
WITH "spellings" AS (
    SELECT lower(btrim("customer_name")) AS "key",
           btrim("customer_name")        AS "spelling",
           COUNT(*)                      AS "uses",
           MAX("created_at")             AS "last_used",
           MIN("created_at")             AS "first_used"
    FROM "orders"
    WHERE "type" = 'SALE'
      AND "customer_name" IS NOT NULL
      AND btrim("customer_name") <> ''
    GROUP BY 1, 2
)
INSERT INTO "customers" ("name", "created_at", "updated_at")
SELECT (array_agg("spelling" ORDER BY "uses" DESC, "last_used" DESC))[1],
       MIN("first_used"),
       CURRENT_TIMESTAMP
FROM "spellings"
GROUP BY "key"
ORDER BY MIN("first_used");

UPDATE "orders" AS o
SET "customer_id" = c."id"
FROM "customers" AS c
WHERE o."type" = 'SALE'
  AND o."customer_name" IS NOT NULL
  AND btrim(o."customer_name") <> ''
  AND lower(btrim(o."customer_name")) = lower(c."name");

-- Business rule enforced by the database: only SALE orders may reference a customer.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_only_on_sales" CHECK ("customer_id" IS NULL OR "type" = 'SALE');
