DROP INDEX "tickets_event_seat_unique";

CREATE UNIQUE INDEX "tickets_event_seat_unique" ON "tickets"("event_id", "seat_id")
WHERE "seat_id" IS NOT NULL AND "status" <> 'void';
