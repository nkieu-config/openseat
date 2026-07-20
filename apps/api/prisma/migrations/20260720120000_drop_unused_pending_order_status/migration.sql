-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('awaiting_payment', 'paid', 'expired', 'canceled', 'partially_refunded', 'refunded');
ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment';
COMMIT;
