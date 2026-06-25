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

// Request latency histogram, labelled so p50/p95/p99 can be derived per route.
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// Plain-number mirror of the booking counters so /api/stats can return them as
// JSON without parsing the Prometheus text format.
const counts = { bookings: 0, conflicts: 0 };

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

/** Snapshot of the booking counters for the /api/stats endpoint. */
export function getBookingCounts(): { bookings: number; conflicts: number } {
  return { ...counts };
}
