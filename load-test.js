import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    scenarios: {
        race_condition: {
            executor: 'per-vu-iterations',
            vus: 50, // 50 users at once
            iterations: 1, // Each tries once
            maxDuration: '30s',
        },
    },
};

const PORTS = [3000, 3001, 3002, 3003, 3004];

export default function () {
    const port = PORTS[Math.floor(Math.random() * PORTS.length)];
    const url = `http://localhost:${port}/api/book-async`;

    // Everyone attacks Seat #1.
    // Since we have 50 users and only 1 seat, 49 SHOULD fail.
    // If > 1 succeeds, we have a race condition.
    const payload = JSON.stringify({
        userId: `user-${__VU}`,
        seatNumber: 1
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const res = http.post(url, payload, params);

    check(res, {
        'status is 202 (Accepted)': (r) => r.status === 202,
    });
}
