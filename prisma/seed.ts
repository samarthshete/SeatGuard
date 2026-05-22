import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Seeding database...");

    // 1. Create the detailed Event "Taylor Swift Concert"
    const event = await prisma.event.create({
        data: {
            name: "The Eras Tour",
            date: new Date("2026-06-01"),
            totalSeats: 10000
        }
    });

    console.log(`Created Event: ${event.name}`);

    // 2. Create 10,000 Seats (Batch insert is faster)
    const seatsPayload = [];
    for (let i = 1; i <= 10000; i++) {
        seatsPayload.push({
            number: i,
            row: "A",
            status: "AVAILABLE",
            eventId: event.id
        });
    }

    // Prisma createMany is efficient
    await prisma.seat.createMany({
        data: seatsPayload
    });

    console.log(`Seeded 10,000 seats for Event ID: ${event.id}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
