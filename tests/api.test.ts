// Integration tests for the live HTTP path (auth + booking), driven through
// Fastify's in-process `inject` against a REAL PostgreSQL database.
//
// Requires DATABASE_URL (a throwaway/test DB — these tests WIPE the tables in
// beforeAll). When DATABASE_URL is unset, the whole suite is skipped so a plain
// `npm test` with no database still passes. CI provides a Postgres service.

// Make the limiter effectively unlimited and provide a JWT secret BEFORE the app
// is built (buildApp reads these at registration time).
process.env.RATE_LIMIT_MAX = '1000000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

import Fastify, { FastifyInstance } from 'fastify';
import { buildApp, prisma, releaseExpiredHolds } from '../src/index';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

async function seedSeats(count: number) {
  const event = await prisma.event.create({
    data: { name: 'Integration Test', date: new Date('2026-06-01'), totalSeats: count },
  });
  await prisma.seat.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      row: 'A',
      status: 'AVAILABLE',
      eventId: event.id,
    })),
  });
}

d('HTTP API (integration)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = Fastify();
    await buildApp(app);
    await app.ready();

    // Own the database: clean slate, then seed 40 AVAILABLE seats.
    await prisma.booking.deleteMany();
    await prisma.seat.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
    await seedSeats(40);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  test('register returns 201 + token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'alice@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    token = res.json().token;
    expect(typeof token).toBe('string');
  });

  test('login returns 200 + token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBeTruthy();
  });

  test('login with wrong password returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alice@example.com', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  test('/api/auth/me requires a valid token', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anon.statusCode).toBe(401);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('alice@example.com');
  });

  test('booking without auth is rejected (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/book-async',
      payload: { seatNumber: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  test('booking an available seat succeeds (200), re-booking conflicts (409)', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/book-async',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 5 },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/book-async',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 5 },
    });
    expect(second.statusCode).toBe(409);
  });

  test('booking a missing seat returns 404; bad body returns 400', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/book-async',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 99999 },
    });
    expect(missing.statusCode).toBe(404);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/book-async',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: -1 },
    });
    expect(bad.statusCode).toBe(400);
  });

  test('CONCURRENCY: 25 simultaneous bookings on one seat → exactly 1 success, no oversell', async () => {
    const N = 25;
    const seatNumber = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        app.inject({
          method: 'POST',
          url: '/api/book-async',
          headers: { authorization: `Bearer ${token}` },
          payload: { seatNumber },
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode);
    const successes = codes.filter((c) => c === 200).length;
    const conflicts = codes.filter((c) => c === 409).length;

    expect(successes).toBe(1); // the oversell guard: never more than one winner
    expect(conflicts).toBe(N - 1);

    // Exactly one Booking row exists for that seat.
    const seat = await prisma.seat.findFirst({ where: { number: seatNumber } });
    const bookings = await prisma.booking.count({ where: { seatId: seat!.id } });
    expect(bookings).toBe(1);
  });

  test('/api/stats reflects real booked/conflict counts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.seats.total).toBe(40);
    expect(body.seats.booked).toBeGreaterThanOrEqual(2); // seat 5 + seat 20
    expect(body.bookings.conflicts).toBeGreaterThanOrEqual(24);
  });

  test('/metrics exposes the real Prometheus counters', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('bookings_total');
    expect(res.body).toContain('booking_conflicts_total');
    expect(res.body).toContain('holds_total');
  });

  // --- Seat holds (reserve -> confirm -> expire) ---------------------------

  async function authToken(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: 'password123' },
    });
    return res.json().token;
  }

  test('holding a seat succeeds (200, HELD); a second user gets 409', async () => {
    const hold = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 11 },
    });
    expect(hold.statusCode).toBe(200);
    expect(hold.json().status).toBe('HELD');

    const seat = await prisma.seat.findFirst({ where: { number: 11 } });
    expect(seat!.status).toBe('HELD');

    const bobToken = await authToken('bob@example.com');
    const contested = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { seatNumber: 11 },
    });
    expect(contested.statusCode).toBe(409);
  });

  test('confirming a held seat books it; re-confirm with same key is idempotent', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 13 },
    });

    const key = 'idem-key-confirm-13';
    const first = await app.inject({
      method: 'POST',
      url: '/api/holds/13/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { idempotencyKey: key },
    });
    expect(first.statusCode).toBe(200);
    const bookingId = first.json().bookingId;

    // Same key again → same booking, no duplicate.
    const again = await app.inject({
      method: 'POST',
      url: '/api/holds/13/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { idempotencyKey: key },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().bookingId).toBe(bookingId);

    const seat = await prisma.seat.findFirst({ where: { number: 13 } });
    const count = await prisma.booking.count({ where: { seatId: seat!.id } });
    expect(count).toBe(1);
  });

  test('confirming after the hold expires returns 409', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 14 },
    });
    // Force the hold into the past.
    await prisma.seat.updateMany({
      where: { number: 14 },
      data: { heldUntil: new Date(Date.now() - 1000) },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/holds/14/confirm',
      headers: { authorization: `Bearer ${token}` },
      payload: { idempotencyKey: 'idem-key-expired-14' },
    });
    expect(res.statusCode).toBe(409);
  });

  test('releaseExpiredHolds() returns an expired hold to AVAILABLE', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { authorization: `Bearer ${token}` },
      payload: { seatNumber: 16 },
    });
    await prisma.seat.updateMany({
      where: { number: 16 },
      data: { heldUntil: new Date(Date.now() - 1000) },
    });

    const released = await releaseExpiredHolds();
    expect(released).toContain(16);

    const seat = await prisma.seat.findFirst({ where: { number: 16 } });
    expect(seat!.status).toBe('AVAILABLE');
    expect(seat!.heldBy).toBeNull();
  });
});
