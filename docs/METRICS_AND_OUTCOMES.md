# METRICS & OUTCOMES — TicketBlitz / SeatGuard

**Real metrics are now collected server-side** (`GET /metrics` Prometheus + `GET /api/stats`). Performance numbers are still only measured on demand (see `docs/BENCHMARKS.md`) — anything not yet run is labeled "Not measured yet". **No invented numbers.**

---

## Currently measurable from the codebase
| Item | Value | Source |
|---|---|---|
| Backend LOC (`src`) / Frontend (`client/src`) | ~735 / ~598 lines | `wc -l` over `*.ts`/`*.tsx` |
| Tests | **22 across 3 files** — 8 unit run always; 14 DB-gated integration cover live auth/booking/holds | `tests/*.ts`, `jest` |
| Test coverage of **live** API/auth/booking/holds | **covered** by `tests/api.test.ts` (Fastify `inject` vs Postgres); auto-skips without `DATABASE_URL` | was 0% before this work |
| Live server metrics | `/metrics`: `bookings_total`, `booking_conflicts_total`, `holds_total`, `holds_confirmed_total`, `holds_expired_total`, `http_request_duration_seconds` | `src/metrics.ts` |
| Production `npm audit` | **0 vulnerabilities** | `npm audit --omit=dev` |
| Total `npm audit` | 19 moderate (dev-only) | `npm audit` |
| Quality gates | typecheck/lint/test/build all pass | local runs |
| Concurrency correctness (automated + CI-gated) | 20 & 50 parallel bookings on one seat → **1 success, N−1 conflicts, oversell=0** | `scripts/concurrency-check.mjs`, CI oversell gate, `docs/BENCHMARKS.md` |

> The concurrency result is now a **reproducible, CI-enforced** check (not a one-off): `npm run concurrency-check` and the `concurrency-gate` CI job fail on any oversell.

## UI telemetry — fixed: now real
The dashboard (`client/src/components/Visualizer.tsx`) previously showed fabricated
"Redis Locks / Kafka Events / DB Writes" counters incremented client-side. It now renders
**real** values fetched from `GET /api/stats` (Booked / Available / Conflicts), backed by the
database and the server-side counters in `src/metrics.ts`. See `docs/BENCHMARKS.md` for how to
generate defensible performance numbers.

## Performance metrics that SHOULD be tracked
| Metric | Status | How to measure |
|---|---|---|
| API p50/p95/p99 latency per route | Not measured yet | OpenTelemetry → collector (Tempo/Jaeger) or Render metrics; or k6 thresholds |
| Booking endpoint throughput (req/s) | Not measured yet | Run `load-test.js` (k6) against a staging API; record RPS |
| Double-booking rate under load | Not measured yet | k6 scenario: N VUs all book 1 seat; assert exactly 1×200 + (N-1)×409 |
| DB query time (booking UPDATE, seats SELECT) | Not measured yet | Prisma logging / pg `EXPLAIN ANALYZE` |
| Socket.io broadcast latency | Not measured yet | Timestamp emit vs client receive in an instrumented test |
| Cold-start time (Render free) | Not measured yet | Time first request after idle |
| Error rate (5xx %) | Not measured yet | Log-based or APM |

## Product metrics that SHOULD be tracked
| Metric | Status | How |
|---|---|---|
| Visit → register conversion | Not measured yet | Frontend analytics events |
| Register → first booking conversion | Not measured yet | Backend event on first booking |
| Seats booked / total (sell-through) | **Computable now** from DB | `COUNT(status='BOOKED')/COUNT(*)` |
| Bookings per user | Not measured yet | Aggregate `Booking` by `userId` |
| Failed booking attempts (409 rate) | Not measured yet | Count 409 responses |

## Engineering metrics that SHOULD be tracked
| Metric | Status | How |
|---|---|---|
| Test coverage (live paths) | live auth/booking/holds covered by `tests/api.test.ts`; run `jest --coverage` to quantify the % | integration suite added |
| CI pass rate / build time | Not tracked | GitHub Actions insights |
| Deploy frequency / lead time | Not tracked | Render/Vercel + git history |
| MTTR, uptime | Not tracked | Uptime monitor (e.g. cron ping `/health`) |
| Dependency vulnerabilities over time | snapshot only | scheduled `npm audit` in CI |

## Suggested benchmark tests to generate defensible metrics
1. **Concurrency correctness (headline):** k6 — 200 VUs each `POST /api/book-async` for the same seat; assert exactly one 200. Output: "0 double-bookings at 200 concurrent."
2. **Throughput + latency:** k6 ramp 0→500 VUs across distinct seats; capture RPS, p95, error rate with thresholds (`http_req_duration p(95)<300`, `http_req_failed<1%`).
3. **Cold vs warm:** scripted timing of first request after idle vs steady-state.
4. **DB cost:** `EXPLAIN ANALYZE` the booking `UPDATE` and `seats` `SELECT` at 10k seats (matching `prisma/seed.ts`).
5. **Real-time fanout:** N connected socket clients; measure emit→receive delay at increasing N.

> ⚠️ Run benchmarks against a **dedicated staging DB**, not the shared `contextlens-pg`, and not at high VU counts on Render free tier (rate limiting + cold starts will distort results).

---

## Benchmark suite to run (defensible, reproducible) — added by strategy pass

These tie directly to the strategy (`docs/FUTURE_IMPLEMENTATION_STRATEGY.md`) and the top-3 plan (`docs/IMMEDIATE_BUILD_PLAN.md`). **All values below are placeholders to fill from real runs — do not cite until measured.**

### B1 — Oversell correctness (the headline)
- **Tool:** k6 (`load-test.js`, rewritten to auth first). Scenario: N VUs all `POST /api/book-async` for one seat.
- **Assert:** exactly one 200; custom metric `oversell_total = (count of 200) - 1` must equal 0.
- **Record:** `| concurrency (VUs) | successes | conflicts(409) | oversell |` — _Not measured yet._

### B2 — Throughput & latency under load
- **Tool:** k6 ramp 0→500 VUs across distinct seats. Thresholds: `http_req_duration p(95)<300ms`, `http_req_failed<1%`.
- **Record:** `| RPS | p50 | p95 | p99 | 5xx% |` — _Not measured yet._

### B3 — 409 contention rate
- **Definition:** `409 / (200 + 409)` on the booking endpoint under B1/B2.
- **Source:** k6 summary or `booking_conflicts_total` if `/metrics` is added.
- **Record:** _Not measured yet._

### B4 — Cold-start vs warm (Render free)
- **Method:** time first request after >15 min idle vs steady-state median.
- **Record:** `| cold (ms) | warm median (ms) |` — _Not measured yet._

### B5 — DB query cost at scale
- **Method:** seed 10,000 seats (`prisma/seed.ts`); `EXPLAIN ANALYZE` the booking `UPDATE` and `GET /api/seats` `SELECT`.
- **Record:** _Not measured yet._

### B6 — Real-time fan-out latency
- **Method:** M connected socket clients; measure emit→receive delay for `seat-update` as M grows (single-instance, then with Redis adapter).
- **Record:** _Not measured yet._

### Metrics to expose via `/metrics` (Prometheus, when F4 lands)
`http_request_duration_seconds` (histogram), `bookings_total`, `booking_conflicts_total`, `holds_total`, `holds_confirmed_total`, `holds_expired_total` (all **implemented**), plus a future **`oversell_total` (alert if >0)**. Suggested SLOs: **oversell=0**, p95<300ms, 5xx<1%.

### Test-coverage outcome to track
`tests/api.test.ts` now exercises the live `src/index.ts` handlers (auth, booking, holds, idempotency, expiry, reaper) via Fastify `inject` against Postgres. Run `jest --coverage` (with `DATABASE_URL` set) to quantify the live-path coverage %.
