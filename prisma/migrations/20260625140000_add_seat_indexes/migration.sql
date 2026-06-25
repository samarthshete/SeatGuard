-- CreateIndex
CREATE INDEX "Seat_number_idx" ON "Seat"("number");

-- CreateIndex
CREATE INDEX "Seat_status_heldUntil_idx" ON "Seat"("status", "heldUntil");
