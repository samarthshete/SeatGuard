// Real, server-side metrics. Unlike the old client-side "telemetry" counters,
// every value here is incremented by the API as actual requests happen, and is
// exposed two ways:
//   - GET /metrics    → Prometheus text format (for scraping / Grafana)
//   - GET /api/stats  → small JSON summary the frontend renders honestly
//
// Kept in its own module so it can be unit-tested without booting the server.
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

export const registry = new Registry();

// Default process metrics (event-loop lag, heap, GC, CPU, …).
collectDefaultMetrics({ register: registry });

// Successful seat bookings (HTTP 200 from /api/book-async).
export const bookingsTotal = new Counter({
  name: 'bookings_total',
  help: 'Total successful seat bookings',
  registers: [registry],
});

// Booking attempts that lost the race for an already-claimed seat (HTTP 409).
export const bookingConflictsTotal = new Counter({
  name: 'booking_conflicts_total',
  help: 'Total booking attempts rejected because the seat was already taken (409)',
  registers: [registry],
});

// Seat holds placed (AVAILABLE -> HELD).
export const holdsTotal = new Counter({
  name: 'holds_total',
  help: 'Total seat holds placed',
  registers: [registry],
});

// Holds confirmed into bookings (HELD -> BOOKED).
export const holdsConfirmedTotal = new Counter({
  name: 'holds_confirmed_total',
  help: 'Total holds confirmed into bookings',
  registers: [registry],
});

// Holds released by the reaper after expiry (HELD -> AVAILABLE).
export const holdsExpiredTotal = new Counter({
  name: 'holds_expired_total',
  help: 'Total holds released after expiring',
  registers: [registry],
});

// Request latency histogram, labelled so p50/p95/p99 can be derived per route.
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Plain-number mirror of the counters so /api/stats can return them as JSON
// without parsing the Prometheus text format.
const counts = { bookings: 0, conflicts: 0, holds: 0, holdsConfirmed: 0, holdsExpired: 0 };

/** Record the outcome of a booking attempt (updates Prometheus + the JSON mirror). */
export function recordBooking(outcome: 'success' | 'conflict'): void {
  if (outcome === 'success') {
    bookingsTotal.inc();
    counts.bookings += 1;
  } else {
    bookingConflictsTotal.inc();
    counts.conflicts += 1;
  }
}

/** Record a hold being placed. */
export function recordHold(): void {
  holdsTotal.inc();
  counts.holds += 1;
}

/** Record a hold being confirmed into a booking. */
export function recordHoldConfirmed(): void {
  holdsConfirmedTotal.inc();
  counts.holdsConfirmed += 1;
}

/** Record n holds released by the reaper after expiry. */
export function recordHoldExpired(n: number): void {
  if (n <= 0) return;
  holdsExpiredTotal.inc(n);
  counts.holdsExpired += n;
}

/** Snapshot of the booking counters for the /api/stats endpoint. */
export function getBookingCounts(): { bookings: number; conflicts: number } {
  return { bookings: counts.bookings, conflicts: counts.conflicts };
}

/** Snapshot of the hold counters for the /api/stats endpoint. */
export function getHoldCounts(): { placed: number; confirmed: number; expired: number } {
  return { placed: counts.holds, confirmed: counts.holdsConfirmed, expired: counts.holdsExpired };
}
