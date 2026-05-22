import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    await prisma.seat.updateMany({
        where: { number: 1 },
        data: { status: "AVAILABLE" }
    });

    // Also delete bookings for this seat
    // Use deleteMany because we don't know the booking ID
    // Be careful with relations.
    // We need to find the booking for this seat first?
    // Or just delete all bookings for seat with number 1?
    // Schema: Booking -> seatId. Seat -> number.

    const seat = await prisma.seat.findFirst({ where: { number: 1 } });
    if (seat) {
        await prisma.booking.deleteMany({
            where: { seatId: seat.id }
        });
    }

    console.log("Reset Seat #1 to AVAILABLE");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
