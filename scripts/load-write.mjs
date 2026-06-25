#!/usr/bin/env node
// Write-path load harness (no k6 needed). Books DISTINCT seats concurrently and
// reports throughput + latency percentiles + error rate for POST /api/book-async.
//
// Usage (needs a running API + a DB seeded with enough AVAILABLE seats):
//   BASE_URL=http://localhost:3000 TOTAL=4000 CONCURRENCY=50 START_SEAT=1 \
//     node scripts/load-write.mjs
//
// Requires Node 18+ (global fetch).

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TOTAL = Number(process.env.TOTAL || 4000);
const CONCURRENCY = Number(process.env.CONCURRENCY || 50);
const START_SEAT = Number(process.env.START_SEAT || 1);

const json = { 'Content-Type': 'application/json' };

async function token() {
  const email = `loadwrite_${Date.now()}_${Math.random().toString(36).slice(2)}@x.com`;
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password: 'password123' }),
  });
  if (!res.ok) throw new Error(`auth failed: HTTP ${res.status}`);
  return (await res.json()).token;
}

function pct(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function main() {
  const t = await token();
  const auth = { ...json, Authorization: `Bearer ${t}` };
  const latencies = [];
  const codes = new Map();
  let next = START_SEAT;

  async function worker() {
    while (true) {
      const seatNumber = next++;
      if (seatNumber > START_SEAT + TOTAL - 1) return;
      const start = process.hrtime.bigint();
      let status = 0;
      try {
        const r = await fetch(`${BASE_URL}/api/book-async`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ seatNumber }),
        });
        status = r.status;
        await r.arrayBuffer();
      } catch {
        status = 0; // network/dropped
      }
      latencies.push(Number(process.hrtime.bigint() - start) / 1e6);
      codes.set(status, (codes.get(status) || 0) + 1);
    }
  }

  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = (Date.now() - t0) / 1000;

  latencies.sort((a, b) => a - b);
  const n = latencies.length;
  const fail5xx = [...codes.entries()].filter(([c]) => c >= 500 || c === 0).reduce((s, [, v]) => s + v, 0);
  const ok = codes.get(200) || 0;

  console.log(`POST /api/book-async — ${n} requests @ ${CONCURRENCY} concurrent`);
  console.log(`  duration:   ${elapsed.toFixed(2)} s`);
  console.log(`  RPS:        ${(n / elapsed).toFixed(0)}`);
  console.log(`  success200: ${ok}`);
  console.log(`  p50:        ${pct(latencies, 0.5).toFixed(1)} ms`);
  console.log(`  p95:        ${pct(latencies, 0.95).toFixed(1)} ms`);
  console.log(`  p99:        ${pct(latencies, 0.99).toFixed(1)} ms`);
  console.log(`  max:        ${latencies[n - 1].toFixed(1)} ms`);
  console.log(`  5xx/errors: ${fail5xx} (${((fail5xx / n) * 100).toFixed(2)}%)`);
  console.log(`  status mix: ${[...codes.entries()].map(([c, v]) => `${c}:${v}`).join('  ')}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
