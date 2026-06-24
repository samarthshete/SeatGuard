import './tracing';
import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

// Allowed browser origins for CORS + WebSockets. Always permit local dev; add
// the deployed frontend via FRONTEND_URL (comma-separated list supported).
const allowedOrigins = [
  'http://localhost:5173',
  ...(process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean)
    : []),
];

// Socket.io instance is created after the HTTP server is listening; expose it
// to route handlers via a module-level reference (avoids decorate-after-ready).
let io: Server | undefined;

// --- Validation -------------------------------------------------------------
const BookingSchema = z.object({
  userId: z.string().min(1).max(255),
  seatNumber: z.number().int().positive(),
});

// --- App wiring -------------------------------------------------------------
// Plugins are registered (and awaited) BEFORE routes so the rate-limiter's
// per-route hooks attach to every route.
async function buildApp(instance: FastifyInstance) {
  // Global per-IP rate limit protects all mutating endpoints (booking) from
  // abuse. /health is exempted so platform probes are never throttled.
  await instance.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    allowList: (req) => req.url === '/health',
  });

  await instance.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Logs the full error server-side but never leaks stack traces / internals to
  // clients. 4xx keep their (safe) message; 5xx return a generic message.
  instance.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    if (status >= 500) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
    return reply.status(status).send({ error: error.message });
  });

  // --- Health check (used by Render / Kubernetes probes) --------------------
  instance.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // --- List all seats -------------------------------------------------------
  instance.get('/api/seats', async (_request, reply) => {
    try {
      const seats = await prisma.seat.findMany({ orderBy: { number: 'asc' } });
      return seats;
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch seats' });
    }
  });

  // --- Get a random available seat (helper for load testing) ----------------
  instance.get('/api/random-seat', async (_request, reply) => {
    try {
      const seat = await prisma.seat.findFirst({ where: { status: 'AVAILABLE' } });
      return seat;
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch seat' });
    }
  });

  // --- Safe booking (atomic, race-free) -------------------------------------
  // Uses a conditional UPDATE so only one concurrent request can flip a seat
  // from AVAILABLE -> BOOKED. `updateMany` returns the number of rows affected,
  // which is the atomicity guard against double-booking.
  instance.post('/api/book-async', async (request, reply) => {
    const parsed = BookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }
    const { userId, seatNumber } = parsed.data;

    try {
      const seat = await prisma.seat.findFirst({ where: { number: seatNumber } });
      if (!seat) {
        return reply.status(404).send({ error: 'Seat not found' });
      }

      // Ensure the user exists (mock auth: userId doubles as email).
      await prisma.user.upsert({
        where: { email: userId },
        update: {},
        create: { id: userId, email: userId, name: 'Test User' },
      });

      // Atomic claim: only succeeds if the seat is still AVAILABLE.
      const claim = await prisma.seat.updateMany({
        where: { id: seat.id, status: 'AVAILABLE' },
        data: { status: 'BOOKED' },
      });

      if (claim.count === 0) {
        return reply.status(409).send({ error: 'Seat already taken' });
      }

      await prisma.booking.create({ data: { userId, seatId: seat.id } });

      // Broadcast the update to all connected clients.
      io?.emit('seat-update', { seatNumber, status: 'BOOKED' });

      return reply.status(200).send({ success: true, status: 'Booked' });
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to process booking' });
    }
  });

  // --- Naive booking (intentionally race-prone) -----------------------------
  // Kept as an educational endpoint that demonstrates the double-booking race
  // the safe endpoint above prevents. Do NOT use in production booking flows.
  instance.post('/api/book-naive', async (request, reply) => {
    const parsed = BookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }
    const { userId, seatNumber } = parsed.data;

    try {
      const seat = await prisma.seat.findFirst({ where: { number: seatNumber } });
      if (!seat) {
        return reply.status(404).send({ error: 'Seat not found' });
      }
      if (seat.status !== 'AVAILABLE') {
        return reply.status(409).send({ error: 'Seat already taken' });
      }

      // Simulated "thinking time" — the window where the race condition occurs.
      await new Promise((r) => setTimeout(r, 50));

      await prisma.user.upsert({
        where: { email: userId },
        update: {},
        create: { id: userId, email: userId, name: 'Test User' },
      });

      await prisma.seat.update({ where: { id: seat.id }, data: { status: 'BOOKED' } });
      const booking = await prisma.booking.create({ data: { userId, seatId: seat.id } });

      return reply.send({ success: true, bookingId: booking.id });
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to process booking' });
    }
  });
}

// --- Bootstrap seed ---------------------------------------------------------
// Idempotent: seeds a demo event + 100 seats only when the table is empty, so a
// freshly migrated production database is never an empty grid on first load.
async function ensureSeedData() {
  const existing = await prisma.seat.count();
  if (existing > 0) return;

  app.log.info('No seats found — seeding demo event with 100 seats…');
  const event = await prisma.event.create({
    data: { name: 'The Eras Tour', date: new Date('2026-06-01'), totalSeats: 100 },
  });
  await prisma.seat.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      row: 'A',
      status: 'AVAILABLE',
      eventId: event.id,
    })),
  });
  app.log.info(`Seeded 100 seats for event ${event.id}`);
}

// --- Startup / shutdown -----------------------------------------------------
const main = async () => {
  const port = Number(process.env.PORT) || 3000;
  try {
    await buildApp(app);
    await ensureSeedData();

    const address = await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server running on ${address}`);

    io = new Server(app.server, { cors: { origin: allowedOrigins } });
    io.on('connection', (socket) => {
      app.log.info(`Client connected: ${socket.id}`);
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully…`);
  try {
    io?.close();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main();
