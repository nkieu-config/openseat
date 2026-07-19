-- ClampExistingRows
UPDATE "ticket_types" SET "remaining" = 0 WHERE "remaining" < 0;

-- AddCheckConstraint
ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_remaining_non_negative" CHECK ("remaining" >= 0);
