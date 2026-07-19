-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_requested_by_id_fkey";

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "requested_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
