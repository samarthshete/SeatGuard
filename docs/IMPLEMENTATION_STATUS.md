# IMPLEMENTATION STATUS — TicketBlitz / SeatGuard

Brutally honest, evidence-based. "Live build" = what's deployed now (pre-auth). "Branch build" = `production-deploy-prep` (auth).

---

## Completed features
| Feature | Evidence | Notes |
|---|---|---|
| Atomic race-free booking | `src/index.ts` `prisma.seat.updateMany({where:{status:'AVAILABLE'}})` | Verified: 1 winner / N-1 conflicts under concurrency |
| Seat holds + idempotency | `POST /api/holds`, `POST /api/holds/:n/confirm`, `releaseExpiredHolds` reaper | reserve→confirm→expire; idempotency key dedups confirms; integration-tested |
| Real-time seat updates | `io.emit('seat-update')` + `client/src/App.tsx` socket listener | Verified live |
| JWT auth (register/login/me) | `src/index.ts`, `client/src/components/AuthPanel.tsx` | **Branch build only**, verified locally |
| Auth-gated booking, userId from token | `book-async` preHandler `authenticate` | Closes "book as anyone" |
| Input validation | Zod schemas in `src/index.ts` | All mutating routes |
| Rate limiting | `@fastify/rate-limit`, stricter on `/api/auth/login` | `/health` exempt |
| Sanitized errors | `setErrorHandler` in `src/index.ts` | No stack traces in 5xx |
| Graceful shutdown | SIGINT/SIGTERM handlers | Drains server, disconnects Prisma |
| Bootstrap seed (idempotent) | `ensureSeedData()` | 100 seats on first boot |
| Health check | `GET /health` | No DB, no auth |
| CI pipeline | `.github/workflows/ci.yml` | Lint/typecheck/build/test/docker |
| Live deployment | Render + Vercel | https://seatguard.vercel.app |

## Partially completed
| Feature | What's done | What's missing |
|---|---|---|
| Auth system | register/login/me, hashing, token | No password reset, email verification, refresh tokens, revocation |
| Observability | structured logs, opt-in tracing, **real `/metrics` (Prometheus) + `/api/stats`** | No external dashboards wired (Grafana) yet |
| Deployment hardening | Render+Vercel live, health, migrations on start | Docker image never actually built; k8s manifests reference non-existent images |
| Seed strategy | bootstrap seeds 100; `prisma/seed.ts` seeds 10,000 | Two different seat counts → inconsistent; `seed.ts` not run in deploy |

## Broken / incomplete / misleading
| Item | Issue | File |
|---|---|---|
| ~~"Engineering Telemetry" panel~~ | **FIXED** — now renders real `/api/stats` data (Booked / Available / Conflicts) | `client/src/components/Visualizer.tsx` |
| ~~README accuracy~~ | **FIXED** — rewritten to match the real Fastify+Prisma+Postgres+Socket.io system (no Kafka/Redis/50k-benchmark) | `README.md` |
| Tests vs reality | 8 tests pass (state-machine + metrics); still **0 tests on the live API/auth/booking handlers** | `tests/*.ts` |
| `prisma.config.ts` | Targets Prisma 6 API; ignored by pinned Prisma 5 (dead) | `prisma.config.ts` |
| Multi-event correctness | `seat.findFirst({where:{number}})` assumes a single event; breaks with >1 event | `src/index.ts` |
| `Seat.version` | Column exists, never read/written (no optimistic locking) | `prisma/schema.prisma` |
| `book-naive` | Intentionally race-prone; fine as a demo but must never be a real flow | `src/index.ts` |

## Dead code (in the live path)
- **Removed:** `src/worker.ts` (Kafka consumer), `src/lib/redis-lock.ts`, `src/lib/kafka-utils.ts` and their tests, plus the `kafkajs`/`ioredis` deps — they were never imported by `src/index.ts`.
- `src/lib/state-machine.ts` — still unused in the live path (only referenced by its unit test).
- `Procfile`, `deploy-ticketblitz.sh`, `k8s/*`, `Dockerfile` — not used by the Render/Vercel deploy.

## Missing core features (for a real product)
- Event management (create/list events; seats per event). Only `prisma/seed.ts` creates events.
- ~~Seat holds with expiry (reserve → confirm)~~ **DONE** (`/api/holds` + confirm + reaper). **Payments** still **not found.**
- Per-user "my bookings" view / booking history endpoint. **Not found.**
- Admin/organizer role + authorization beyond "logged in". **Not found.**
- Password reset / email verification. **Not found.**
- API docs (OpenAPI/Swagger). **Not found.**

## Technical debt
- Single-file API (`src/index.ts`, ~270 lines) — fine now, will need splitting (routes/plugins/services) as it grows.
- Two project names (TicketBlitz vs SeatGuard).
- Remaining dependency surface to watch: the full OTel tree (opt-in only) still dominates dev-only audit noise. (`kafkajs`/`ioredis` have been removed.)
- Inconsistent seed counts (100 vs 10,000).
- App auto-starts on import (`main()` at module bottom) → hard to write in-process integration tests without refactor (export `buildApp`).

## Bugs / risks found
- **Exposed + shared DB credential** (chat-leaked `contextlens_user`, shared with a live app) — highest priority. See `PROJECT_STATUS.md`.
- JWT in `localStorage` → XSS token theft risk.
- No tests guarding the actual business logic → easy silent regressions.
- Multi-event seat collision (above).

## Priority order for fixing/building
1. **P0** Redeploy auth build + set `JWT_SECRET`; migrate to a dedicated DB (de-risk leaked credential).
2. **P0** Add integration tests for `/api/auth/*` and `/api/book-async` (export `buildApp`, use Fastify `inject` + a test Postgres). 
3. **P1** Fix multi-event seat lookup OR explicitly document single-event scope.
4. ~~**P1** Replace fake telemetry with a real `/metrics`~~ — **DONE** (`/metrics` + `/api/stats`; UI wired to real data).
5. ~~**P1** Decide on Kafka/Redis subsystem~~ — **DONE** (deleted).
6. ~~**P2** README rewrite to match reality~~ — **DONE**.
7. **P2** `Seat.status` enum; drop/justify `Seat.version`; unify seed counts.
8. **P3** Password reset, refresh tokens, OpenAPI, organizer features.
