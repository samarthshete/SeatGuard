# Benchmarks — how to generate real, defensible numbers

> **No numbers in this repo are invented.** Tables not yet filled show
> `_Not measured yet_`. Where numbers appear, they were produced by an actual run
> on the environment noted next to them. Re-run on your own target to confirm.

> **Environment for the 2026-06-25 run below:** local machine, ephemeral
> PostgreSQL 16 (single instance), API on `node dist/index.js`, 100-seat seed.
> These are **local-dev** figures — not a production or multi-instance benchmark.

The headline claim worth proving is **correctness under contention**: the booking
endpoint uses an atomic conditional `UPDATE … WHERE status='AVAILABLE'`
(`src/index.ts`, `prisma.seat.updateMany`), so exactly one of N simultaneous
bookings for the same seat succeeds and the rest get `409`. No Redis/Kafka.

## Prerequisites

```bash
# 1. A database (any Postgres; docker-compose provides one locally)
docker-compose up -d            # Postgres on :5432
cp .env.example .env            # set DATABASE_URL, JWT_SECRET
npx prisma migrate deploy

# 2. The API
npm run dev:api                 # http://localhost:3000  (auto-seeds 100 seats)
```

> Run against a **dedicated** database — not a shared one — and avoid high VU
> counts against free-tier hosts (cold starts + rate limiting distort results).

---

## B1 — Oversell correctness (headline)

The most accessible proof. No k6 needed (pure Node, global `fetch`):

```bash
CONCURRENCY=20 node scripts/concurrency-check.mjs
# or: npm run concurrency-check
```

Expected: **exactly 1 success (200), N−1 conflicts (409), oversell = 0.** The
script exits non-zero if more than one booking succeeds.

| concurrency (N) | successes (200) | conflicts (409) | oversell | date |
|---|---|---|---|---|
| 20 | 1 | 19 | **0** | 2026-06-25 |
| 50 | 1 | 49 | **0** | 2026-06-25 |

Server-side counters after both runs confirmed the totals — `/metrics`:
`bookings_total 2`, `booking_conflicts_total 68` (= 19 + 49); `/api/stats`:
`{ seats: { booked: 2, available: 98 }, bookings: { total: 2, conflicts: 68 } }`.

The same correctness gate runs in k6 (`successful_bookings: count<=1`):

```bash
BASE_URL=http://localhost:3000 SEAT=1 OVERSELL_VUS=50 k6 run load-test.js
```

> Note: each run books a seat. Re-seed (`npm run db:seed`) or pick a fresh
> `SEAT`/let the script pick an AVAILABLE one between runs.

---

## B2 — Throughput & latency (read path)

The k6 `read_load` scenario ramps `GET /api/seats` and enforces
`http_req_failed < 1%` and `http_req_duration p(95) < 300ms`.

```bash
BASE_URL=http://localhost:3000 k6 run load-test.js
```

Record from the k6 summary (k6 not installed in the 2026-06-25 run; the row
below is a Node `fetch` measurement of `GET /api/seats`, 300 reqs @ 20 concurrent,
same local-dev environment):

| tool | RPS | p50 (ms) | p95 (ms) | p99 (ms) | error rate | date |
|---|---|---|---|---|---|---|
| Node fetch (read path) | 2400 | 4.1 | 24.5 | 26.9 | 0% | 2026-06-25 |
| k6 (read path) | _Not measured yet_ | | | | | |

---

## B3 — Live metrics

With the API running and after some bookings:

```bash
curl -s localhost:3000/metrics | grep -E 'bookings_total|booking_conflicts_total'
curl -s localhost:3000/api/stats
```

`bookings_total` / `booking_conflicts_total` come from real request handling
(`src/metrics.ts`); `/api/stats` returns real seat counts from the database.
These back the dashboard in the UI — they are not fabricated client-side.

---

## What is intentionally NOT claimed

- No "50,000 requests / 87ms p95" figure exists until B2 is actually run.
- Throughput of the **write** path is bounded by seat inventory (the seed is 100
  seats; raise it with `npm run db:seed` for larger runs).
- See `docs/METRICS_AND_OUTCOMES.md` for the full list of metrics that are
  measurable now vs. not yet measured.
