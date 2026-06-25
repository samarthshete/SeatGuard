# DECISIONS — Architecture & Product Decision Log

Decisions inferred from the code (with likely rationale), honest critiques, and decisions still open. Format inspired by ADRs.

---

## D1 — Atomic conditional UPDATE for booking (instead of Redis lock / Kafka)
- **Visible in:** `src/index.ts` (`updateMany({where:{status:'AVAILABLE'}})`). No Redis/Kafka is involved.
- **Likely why:** simplest correct solution; the DB already provides atomicity, so a distributed lock is unnecessary at this scale.
- **Assessment:** ✅ **Correct.** This is the right call for the current scale and is genuinely race-free.
- **Better alternative:** only needed at extreme scale (queue + worker to smooth write bursts) — would have to be built; it does not exist in the repo.

## D2 — Delete the unwired Kafka/Redis/worker code (RESOLVED)
- **Decision:** the Kafka consumer (`src/worker.ts`), Redis lock (`src/lib/redis-lock.ts`), and Kafka serializer (`src/lib/kafka-utils.ts`) — plus their tests and the `kafkajs`/`ioredis` deps — were **deleted**. They were never imported by the running API.
- **Why:** dead code inflated dependencies, audit surface, and confusion; tests over them gave false confidence. The README also claimed an architecture that didn't run.
- **Assessment:** ✅ The repo now matches reality. If a queue is ever justified by real load, add a lightweight one (e.g. BullMQ) deliberately — see `docs/V2_ARCHITECTURE_PROPOSAL.md`.

## D3 — Self-hosted JWT auth (email+password) over a managed provider
- **Visible in:** `@fastify/jwt`, `bcryptjs`, `/api/auth/*` in `src/index.ts` (branch build).
- **Likely why:** no external dependency/cost; fully self-contained; good engineering showcase.
- **Assessment:** ✅ Reasonable for scope. ⚠️ Missing refresh/revocation/reset/verification; token in `localStorage`.
- **Better alternative:** httpOnly-cookie tokens + CSRF for hardening; a managed provider (Clerk/Auth0) only if social login / enterprise SSO becomes a requirement.

## D4 — `userId` derived from JWT, not request body
- **Visible in:** `book-async` uses `request.user.id`; `BookingSchema` no longer accepts `userId`.
- **Likely why:** the pre-auth version trusted a client-supplied id (anyone could book as anyone).
- **Assessment:** ✅ **Correct and important** — this is the actual authorization fix.

## D5 — Single-file Fastify app
- **Visible in:** all routes/plugins/handlers in `src/index.ts`.
- **Likely why:** small app, fast iteration.
- **Assessment:** ✅ fine now; ⚠️ will need modularization (routes/services/plugins) as features grow. Also blocks easy integration testing (app auto-starts on import).

## D6 — Prisma + PostgreSQL
- **Visible in:** `prisma/schema.prisma`, migrations.
- **Likely why:** type-safe DB access, easy migrations.
- **Assessment:** ✅ Good. ⚠️ `Seat.status` is free-text (should be enum); `Seat.version` unused; `prisma.config.ts` mismatched with pinned v5.

## D7 — Render (API) + Vercel (frontend), not Docker/k8s
- **Visible in:** `render.yaml`, Vercel project; `Dockerfile`/`k8s/` unused.
- **Likely why:** fastest free path to a live URL; Docker/k8s are aspirational.
- **Assessment:** ✅ Right for a demo. ⚠️ Keeping unused Docker/k8s implies an ops maturity that isn't real.

## D8 — Reuse a shared Postgres via `?schema=seatguard`
- **Visible in:** `render.yaml` (DATABASE_URL manual + schema note), `PROJECT_STATUS.md`.
- **Likely why:** Render free tier allows only one free DB; reusing `contextlens-pg` avoided cost.
- **Assessment:** ⚠️ **Risky.** Schema isolation prevents table collisions (verified), but it **couples SeatGuard's uptime to another app** and the credential got exposed. 
- **Better alternative:** dedicated free Neon DB (decided "later").

## D9 — Frontend dashboard wired to real metrics (RESOLVED)
- **Was:** `client/src/components/Visualizer.tsx` showed fabricated "Redis Locks / Kafka Events / DB Writes" counters incremented on click.
- **Now:** it renders **real** values from `GET /api/stats` (Booked / Available / Conflicts), backed by the database and the server-side counters in `src/metrics.ts`. The API also exposes Prometheus metrics at `/metrics`.
- **Assessment:** ✅ Fixed. The dashboard no longer presents fake numbers as system metrics.

## D10 — Opt-in OpenTelemetry tracing
- **Visible in:** `src/tracing.ts` gated on `ENABLE_TRACING`.
- **Likely why:** avoid prod overhead/errors with no collector; keep the capability.
- **Assessment:** ✅ Good gating. ⚠️ The dependency tree is the bulk of remaining (dev-only) audit noise.

## Pending decisions (need a human call)
1. **Project name:** TicketBlitz or SeatGuard — pick one, update everywhere.
2. ~~**Kafka/Redis subsystem:** finish & wire, or delete~~ — **RESOLVED: deleted (D2).**
3. **Database:** stay on shared `contextlens-pg`, or move to dedicated Neon (D8) — strongly lean Neon.
4. **Multi-event:** support multiple events, or stay single-event demo (affects `seat.findFirst`).
5. **Token storage:** keep `localStorage`, or move to httpOnly cookies (D3).
6. ~~**README:** rewrite to match reality~~ — **RESOLVED: rewritten to match the real system.**
7. **Payments/holds:** holds + confirm + expiry + idempotency are **DONE**; **payments** still out of scope (no real checkout).
8. **Prisma version:** stay on 5 (delete `prisma.config.ts`) or upgrade to 6 deliberately.
