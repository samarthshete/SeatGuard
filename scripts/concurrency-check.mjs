#!/usr/bin/env node
// Pure-Node concurrency proof — no k6 required.
//
// Fires N concurrent booking requests at the SAME seat and asserts the atomic
// conditional UPDATE lets exactly ONE succeed (HTTP 200) while all others get a
// 409 conflict. Exits non-zero if more than one booking succeeds (an oversell).
//
// Usage (needs a running API + database):
//   npm run dev:api                       # in another terminal
//   node scripts/concurrency-check.mjs    # or: CONCURRENCY=50 BASE_URL=... node scripts/concurrency-check.mjs
//
// Requires Node 18+ (global fetch).

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const N = Number(process.env.CONCURRENCY || 20);

const json = { 'Content-Type': 'application/json' };

async function registerUser() {
  const email = `concurrency_${Date.now()}@example.com`;
  const password = 'concurrency-check-password';
  let res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 201) {
    res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email, password }),
    });
  }
  if (!res.ok) throw new Error(`auth failed: HTTP ${res.status}`);
  return (await res.json()).token;
}

async function pickAvailableSeat() {
  const res = await fetch(`${BASE_URL}/api/random-seat`);
  if (!res.ok) throw new Error(`random-seat failed: HTTP ${res.status}`);
  const seat = await res.json();
  if (!seat || typeof seat.number !== 'number') {
    throw new Error('no AVAILABLE seat — re-seed the database and try again');
  }
  return seat.number;
}

async function main() {
  console.log(`→ Target: ${BASE_URL}  |  Concurrency: ${N}`);

  const token = await registerUser();
  const seatNumber = await pickAvailableSeat();
  console.log(`→ Contesting seat #${seatNumber} with ${N} simultaneous bookings…`);

  const attempts = Array.from({ length: N }, () =>
    fetch(`${BASE_URL}/api/book-async`, {
      method: 'POST',
      headers: { ...json, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seatNumber }),
    }).then((r) => r.status),
  );

  const statuses = await Promise.all(attempts);
  const successes = statuses.filter((s) => s === 200).length;
  const conflicts = statuses.filter((s) => s === 409).length;
  const other = statuses.filter((s) => s !== 200 && s !== 409);
  const oversell = successes - 1;

  console.log('');
  console.log('RESULT');
  console.log(`  successes (200): ${successes}`);
  console.log(`  conflicts (409): ${conflicts}`);
  if (other.length) console.log(`  unexpected:      ${other.join(', ')}`);
  console.log(`  oversell:        ${oversell}`);
  console.log('');

  if (successes === 1 && conflicts === N - 1) {
    console.log(`✅ PASS — exactly 1 success and ${N - 1} conflicts. No oversell.`);
    process.exit(0);
  }

  console.error('❌ FAIL — expected exactly 1 success and N−1 conflicts.');
  process.exit(1);
}

main().catch((err) => {
  console.error(`❌ ERROR: ${err.message}`);
  process.exit(1);
});
