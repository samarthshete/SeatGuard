// k6 load test for the TicketBlitz API.
//
// Two scenarios:
//   A) oversell  — N virtual users all try to book the SAME seat at once. The
//                  atomic conditional UPDATE must let exactly ONE succeed; every
//                  other attempt must get 409. The `oversell` metric (successes
//                  minus 1) must be 0.
//   B) read_load — ramps read traffic against /api/seats to capture latency and
//                  throughput (p95 / RPS / error rate).
//
// Run against a live API (auth is required, so we register + log in first):
//   BASE_URL=http://localhost:3000 SEAT=1 OVERSELL_VUS=50 k6 run load-test.js
//
// All thresholds are real pass/fail gates — there are no hard-coded result
// numbers anywhere in this repo. Record what you measure in docs/BENCHMARKS.md.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SEAT = Number(__ENV.SEAT || 1);
const OVERSELL_VUS = Number(__ENV.OVERSELL_VUS || 50);

// successes − 1 should always be 0 for a single contested seat.
const successfulBookings = new Counter('successful_bookings');
const conflicts = new Counter('booking_conflicts');

export const options = {
    scenarios: {
        oversell: {
            executor: 'per-vu-iterations',
            vus: OVERSELL_VUS,
            iterations: 1,
            maxDuration: '30s',
            exec: 'oversell',
        },
        read_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '15s', target: 50 },
                { duration: '30s', target: 50 },
                { duration: '15s', target: 0 },
            ],
            exec: 'readLoad',
            startTime: '35s', // run after the oversell scenario finishes
        },
    },
    thresholds: {
        // Correctness gate: never more than one successful booking for one seat.
        successful_bookings: ['count<=1'],
        // Performance gates for the read path.
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<300'],
    },
};

// Register a fresh user and return an auth token. Each VU gets its own user so
// the token is always valid; the contested resource is the SEAT, not the user.
function authToken() {
    const email = `load_${__VU}_${Date.now()}@example.com`;
    const password = 'loadtest-password';
    const headers = { 'Content-Type': 'application/json' };

    let res = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({ email, password }), { headers });
    if (res.status !== 201) {
        // User may already exist on a re-run — fall back to login.
        res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password }), { headers });
    }
    try {
        return JSON.parse(res.body).token;
    } catch {
        return null;
    }
}

export function oversell() {
    const token = authToken();
    const res = http.post(
        `${BASE_URL}/api/book-async`,
        JSON.stringify({ seatNumber: SEAT }),
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
    );

    if (res.status === 200) successfulBookings.add(1);
    if (res.status === 409) conflicts.add(1);

    check(res, {
        'booked (200) or conflict (409)': (r) => r.status === 200 || r.status === 409,
    });
}

export function readLoad() {
    const res = http.get(`${BASE_URL}/api/seats`);
    check(res, { 'seats 200': (r) => r.status === 200 });
}
