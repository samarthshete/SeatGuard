import {
  registry,
  recordBooking,
  getBookingCounts,
} from '../src/metrics';

describe('metrics module', () => {
  test('recordBooking increments the success / conflict counters', () => {
    const before = getBookingCounts();

    recordBooking('success');
    recordBooking('success');
    recordBooking('conflict');

    const after = getBookingCounts();
    expect(after.bookings).toBe(before.bookings + 2);
    expect(after.conflicts).toBe(before.conflicts + 1);
  });

  test('registry exposes the custom booking metrics in Prometheus format', async () => {
    recordBooking('success');
    const output = await registry.metrics();
    expect(output).toContain('bookings_total');
    expect(output).toContain('booking_conflicts_total');
    expect(output).toContain('http_request_duration_seconds');
  });

  test('getBookingCounts returns a copy (caller cannot mutate internal state)', () => {
    const snapshot = getBookingCounts();
    snapshot.bookings = 99999;
    expect(getBookingCounts().bookings).not.toBe(99999);
  });
});
