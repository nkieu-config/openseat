-- DropIndex
DROP INDEX "tickets_event_id_idx";

-- CreateIndex
CREATE INDEX "orders_event_id_status_idx" ON "orders"("event_id", "status");

-- CreateIndex
CREATE INDEX "tickets_event_id_status_idx" ON "tickets"("event_id", "status");
