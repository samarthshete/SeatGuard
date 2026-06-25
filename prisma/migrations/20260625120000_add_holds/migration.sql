-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "heldBy" TEXT,
ADD COLUMN     "heldUntil" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");
