import './tracing';
import Fastify, {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';
import {
  registry,
  httpRequestDuration,
  recordBooking,
  getBookingCounts,
} from './metrics';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

// JWT secret — REQUIRED in production. In development we fall back to an
// obviously-insecure value (with a warning) so local runs work out of the box.
const JWT_SECRET = process.env.JWT_SECRET ?? '';

// Token / authenticated-user shape.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string };
    user: { id: string; email: string };
  }
}
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

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
const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});
const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});
// Booking no longer trusts a client-supplied userId — it comes from the token.
const BookingSchema = z.object({
  seatNumber: z.number().int().positive(),
});

// --- App wiring -------------------------------------------------------------
// Plugins are registered (and awaited) BEFORE routes so the rate-limiter's
// per-route hooks attach to every route.
async function buildApp(instance: FastifyInstance) {
  if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    instance.log.warn('JWT_SECRET not set — using an insecure development secret');
  }

  // Global per-IP rate limit protects all mutating endpoints from abuse.
  // /health and /metrics are exempted so platform probes and Prometheus scrapes
  // are never throttled.
  await instance.register(rateLimit, {
    global: true,
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    allowList: (req) => req.url === '/health' || req.url === '/metrics',
  });

  // Record request latency for every response (labelled by method/route/status
  // so p50/p95/p99 can be derived per route in Prometheus).
  instance.addHook('onResponse', async (request, reply) => {
    httpRequestDuration.observe(
      {
        method: request.method,
        route: request.routeOptions?.url ?? request.url,
        status: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });

  await instance.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await instance.register(jwt, { secret: JWT_SECRET || 'dev-insecure-secret-change-me' });

  // preHandler that rejects requests without a valid bearer token.
  instance.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
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

  // --- Prometheus metrics (real, server-side) -------------------------------
  instance.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // --- Stats summary (real numbers for the UI dashboard) --------------------
  // Seat counts come straight from the database; booking counters come from the
  // metrics module. Nothing here is fabricated client-side.
  instance.get('/api/stats', async (_request, reply) => {
    try {
      const [total, booked] = await Promise.all([
        prisma.seat.count(),
        prisma.seat.count({ where: { status: 'BOOKED' } }),
      ]);
      const { bookings, conflicts } = getBookingCounts();
      return {
        seats: { total, booked, available: total - booked },
        bookings: { total: bookings, conflicts },
      };
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to fetch stats' });
    }
  });

  // --- Auth: register -------------------------------------------------------
  instance.post('/api/auth/register', async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }
    const { email, password, name } = parsed.data;
    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ error: 'Email already registered' });
      }
      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, password: hash, name: name ?? null },
      });
      const token = await reply.jwtSign({ id: user.id, email: user.email });
      return reply.status(201).send({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to register' });
    }
  });

  // --- Auth: login (stricter rate limit to slow brute force) ----------------
  instance.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' });
      }
      const { email, password } = parsed.data;
      try {
        const user = await prisma.user.findUnique({ where: { email } });
        // Same generic 401 whether the email is unknown or the password is wrong.
        if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
        const token = await reply.jwtSign({ id: user.id, email: user.email });
        return reply.send({ token, user: { id: user.id, email: user.email, name: user.name } });
      } catch (error) {
        instance.log.error(error);
        return reply.status(500).send({ error: 'Failed to log in' });
      }
    },
  );

  // --- Auth: current user ---------------------------------------------------
  instance.get('/api/auth/me', { preHandler: instance.authenticate }, async (request) => {
    return { user: request.user };
  });

  // --- List all seats (public read) -----------------------------------------
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

  // --- Safe booking (auth required, atomic, race-free) ----------------------
  // Auth required; the booking user is taken from the verified token, never the
  // body. The conditional UPDATE means only one concurrent request can flip a
  // seat from AVAILABLE -> BOOKED, which guards against double-booking.
  instance.post('/api/book-async', { preHandler: instance.authenticate }, async (request, reply) => {
    const parsed = BookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }
    const { seatNumber } = parsed.data;
    const userId = request.user.id;

    try {
      const seat = await prisma.seat.findFirst({ where: { number: seatNumber } });
      if (!seat) {
        return reply.status(404).send({ error: 'Seat not found' });
      }

      // Atomic claim: only succeeds if the seat is still AVAILABLE.
      const claim = await prisma.seat.updateMany({
        where: { id: seat.id, status: 'AVAILABLE' },
        data: { status: 'BOOKED' },
      });

      if (claim.count === 0) {
        recordBooking('conflict');
        return reply.status(409).send({ error: 'Seat already taken' });
      }

      await prisma.booking.create({ data: { userId, seatId: seat.id } });
      recordBooking('success');

      // Broadcast the update to all connected clients.
      io?.emit('seat-update', { seatNumber, status: 'BOOKED' });

      return reply.status(200).send({ success: true, status: 'Booked' });
    } catch (error) {
      instance.log.error(error);
      return reply.status(500).send({ error: 'Failed to process booking' });
    }
  });

  // --- Naive booking (auth required, intentionally race-prone) --------------
  // Educational endpoint demonstrating the double-booking race the safe endpoint
  // prevents. Auth-gated so it isn't an open write. Do NOT use as a real flow.
  instance.post('/api/book-naive', { preHandler: instance.authenticate }, async (request, reply) => {
    const parsed = BookingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }
    const { seatNumber } = parsed.data;
    const userId = request.user.id;

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
