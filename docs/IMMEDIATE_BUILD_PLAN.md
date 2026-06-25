# IMMEDIATE BUILD PLAN — Top 3 features

Build in this order: **(1) Integration tests + `buildApp` export → (2) Load-test + correctness metrics → (3) Seat holds + idempotency.** Each is grounded in the current code. No code is implemented yet (analysis only).

---

## Feature 1 — Integration tests for auth + booking (+ export `buildApp`)

**Why now:** the project's tests (`tests/*.ts`) only cover **dead** `src/lib/*` modules; there is **0% coverage of the live API/auth/booking**. A senior reviewer treats "tests that don't test the product" as a red flag. This is the cheapest credibility fix and the safety net for Features 2–3.

**Exact technical work:**
- `src/index.ts` currently calls `main()` at module load, so importing it boots a server — untestable. Refactor so `buildApp(app)` and a `createApp()` are exported and `main()` only runs when executed directly (`if (require.main === module)`).
- Use Fastify's `app.inject()` (no network) against a **test Postgres** (CI already provisions one in `.github/workflows/ci.yml`).

**Step by step:**
1. Refactor `src/index.ts`: export `async function createApp(): Promise<FastifyInstance>` that builds the app (calls `buildApp`) without listening; guard `main()` with `require.main === module`.
2. Add `tests/api.test.ts`:
   - `beforeAll`: set `DATABASE_URL` (CI service), `JWT_SECRET='test'`; run `prisma migrate deploy`; build app via `createApp()`.
   - Cases: register 201 → login 200 → `/me` 200; weak password 400; duplicate 409; wrong password 401; `book-async` without token 401; with token 200; rebook 409; invalid body 400; **concurrency**: fire ~20 `app.inject` bookings on one seat with `Promise.all`, assert exactly one 200.
3. Add a `test:integration` script if you want to separate from unit tests; keep `npm test` running both.
4. Wire into CI (it already runs `jest`); ensure migrations run before tests.

**Files:** `src/index.ts` (export refactor), `tests/api.test.ts` (new), `jest.config.js` (if splitting), `.github/workflows/ci.yml` (ensure migrate step before jest).

**Tests to add:** the cases above (this *is* the test feature).

**Metrics to track:** test coverage of `src/index.ts` via `jest --coverage` (currently effectively 0% → target the booking/auth handlers).

**Resume bullet (once real):** "Wrote integration tests (Fastify `inject` + Postgres) covering auth and a concurrency scenario asserting exactly-one-winner booking; enforced in CI."

**Interview story:** "How do you test a race condition deterministically? I fire N concurrent in-process requests at one seat and assert the response distribution is exactly 1×200 / (N−1)×409."

---

## Feature 2 — Load-test harness + defensible correctness metrics

**Why now:** the central claim — "no double-booking under load" — is currently **unproven** (`docs/METRICS_AND_OUTCOMES.md`: Not measured yet). `load-test.js` exists but CI only checks it *exists*. Turning the claim into a number is the single highest resume/interview ROI.

**Exact technical work:**
- Rewrite `load-test.js` (k6) to authenticate (register/login to get a JWT), then run a **contention scenario** (many VUs, one seat) and a **throughput scenario** (many VUs, distinct seats), with `thresholds` and a JSON summary.
- Add a script to run it against a **dedicated staging API** (not shared `contextlens-pg`, not high-VU on Render free).

**Step by step:**
1. Update `load-test.js`:
   - `setup()`: register + login once per VU (or pre-create tokens), return tokens.
   - Scenario A `contention`: 200 VUs each `POST /api/book-async` for seat 1; **custom check/metric** `oversell` = count of 200s > 1 (must be 0).
   - Scenario B `throughput`: ramp 0→500 VUs across distinct seats; thresholds `http_req_duration p(95)<300`, `http_req_failed<0.01`.
   - Output `--summary-export=loadtest-summary.json`.
2. Add `docs/METRICS_AND_OUTCOMES.md` result table rows and **paste the real numbers** after running (leave "Not measured yet" until then).
3. (Optional, pairs with F #4) add a `prom-client` `/metrics` endpoint exposing `booking_conflicts_total` and `oversell_total` so the dashboard corroborates k6.
4. Add a CI job (or manual workflow) that runs k6 against staging and fails if `oversell>0` or p95 threshold breached.

**Files:** `load-test.js` (rewrite), `docs/METRICS_AND_OUTCOMES.md` (real results), optionally `src/index.ts` (`/metrics`), `.github/workflows/ci.yml` (load-test gate).

**Tests/metrics:** k6 thresholds + `oversell_total`, p95, RPS, 409 rate — all **defensible because reproducible**.

**Resume bullet (once measured):** "Load-tested the booking engine with k6 at N concurrent VUs: 0 oversell, p95 = X ms, Y req/s." (Fill X/Y from a real run.)

**Interview story:** "I proved correctness empirically — here's the k6 contention scenario and the oversell=0 result, plus the p95 under load."

---

## Feature 3 — Seat holds (reserve → confirm) + TTL + idempotency

**Why now:** today booking is instant (`AVAILABLE→BOOKED`). Real reservation systems **hold** a seat while the user decides/pays, then confirm — introducing expiry, abandonment, and idempotency. This is the feature that adds genuine **distributed-systems depth** and the best interview narrative, and it's the prerequisite for payments (F7).

**Exact technical work:**
- DB: add `Seat.status` enum `AVAILABLE|HELD|BOOKED`; add hold fields/`Hold` table (`heldBy`, `heldUntil`); add `IdempotencyKey` table.
- API: `POST /api/holds` (atomic `AVAILABLE→HELD` with `heldUntil`), `POST /api/bookings` (`HELD→BOOKED`, requires owner + unexpired + `Idempotency-Key`), keep/redirect `book-async` for back-compat.
- Expiry: a reaper that releases expired holds (`HELD→AVAILABLE` where `heldUntil<now`) and emits `seat-update`. Start as a `setInterval` in-process for the demo; graduate to BullMQ/Redis (see `docs/V2_ARCHITECTURE_PROPOSAL.md`).
- Frontend: render `HELD` (yellow) with a countdown; "Confirm" button → `/api/bookings`; handle expiry.

**Step by step:**
1. Migration: `Seat.status` enum; `Hold` table (or `heldBy`/`heldUntil` on `Seat`); `IdempotencyKey` table.
2. `POST /api/holds` (auth): `updateMany({where:{id, status:'AVAILABLE'}, data:{status:'HELD', heldBy:userId, heldUntil:now+TTL}})`; `count===0`→409; emit `seat-update HELD`; return `holdId`+expiry.
3. `POST /api/bookings` (auth, `Idempotency-Key` header): look up idempotency key → if present, return stored response; else verify hold owned + `heldUntil>now`; `updateMany HELD→BOOKED`; create `Booking`; store idempotency record; emit `seat-update BOOKED`.
4. Reaper: every ~5s release expired holds; emit `seat-update AVAILABLE`.
5. Frontend: `HELD` state + countdown + Confirm; on expiry revert to `AVAILABLE`.
6. Tests: hold success/conflict; confirm success; confirm after expiry → 409; **idempotent double-confirm returns one booking**; reaper releases.

**Files:** `prisma/schema.prisma` + new migration; `src/index.ts` (routes + reaper); `client/src/App.tsx` (HELD UI + confirm); `tests/api.test.ts` (hold/confirm/idempotency/expiry); later a deliberately-added Redis/BullMQ layer if load justifies it.

**Metrics to track:** `holds_active`, hold→booking conversion, expired-hold rate, idempotent-replay count.

**Resume bullet:** "Implemented a seat-hold→confirm reservation flow with TTL-based expiry and idempotency keys, preventing both oversell and double-charge under retries."

**Interview story:** "What happens when a user holds a seat then abandons checkout? TTL hold + a reaper releases it; confirmation is idempotent so a retried/duplicated request never double-books or double-charges."

---

### Dependencies / sequencing
- F1 first (safety net + credibility). F2 next (proves the existing core; can reuse F1's app harness). F3 last of the three (biggest change; relies on F1 tests to land safely). F3 naturally leads into Redis (F5) and payments (F7).
