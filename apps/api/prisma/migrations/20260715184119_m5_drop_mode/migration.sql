-- AlterTable
ALTER TABLE "events" ADD COLUMN     "drop_mode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sale_opens_at" TIMESTAMP(3);
