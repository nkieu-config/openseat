-- CreateEnum
CREATE TYPE "TicketTypeKind" AS ENUM ('ga', 'seated');

-- AlterTable
ALTER TABLE "ticket_types" ADD COLUMN     "kind" "TicketTypeKind" NOT NULL DEFAULT 'ga';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "seat_id" TEXT;

-- CreateTable
CREATE TABLE "seat_maps" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" TEXT NOT NULL,
    "seat_map_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "ticket_type_id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "row_label" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holds" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "seat_id" TEXT NOT NULL,
    "holder_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seat_maps_event_id_key" ON "seat_maps"("event_id");

-- CreateIndex
CREATE INDEX "seats_event_id_idx" ON "seats"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "seats_seat_map_id_section_row_label_number_key" ON "seats"("seat_map_id", "section", "row_label", "number");

-- CreateIndex
CREATE INDEX "holds_expires_at_idx" ON "holds"("expires_at");

-- CreateIndex
CREATE INDEX "holds_holder_key_idx" ON "holds"("holder_key");

-- CreateIndex
CREATE UNIQUE INDEX "holds_event_id_seat_id_key" ON "holds"("event_id", "seat_id");

-- AddForeignKey
ALTER TABLE "seat_maps" ADD CONSTRAINT "seat_maps_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_seat_map_id_fkey" FOREIGN KEY ("seat_map_id") REFERENCES "seat_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holds" ADD CONSTRAINT "holds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holds" ADD CONSTRAINT "holds_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "tickets_event_seat_unique" ON "tickets"("event_id", "seat_id") WHERE "seat_id" IS NOT NULL;
