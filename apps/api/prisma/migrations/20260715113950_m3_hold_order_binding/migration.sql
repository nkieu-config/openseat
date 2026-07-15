-- AlterTable
ALTER TABLE "holds" ADD COLUMN     "order_id" TEXT;

-- CreateIndex
CREATE INDEX "holds_order_id_idx" ON "holds"("order_id");
