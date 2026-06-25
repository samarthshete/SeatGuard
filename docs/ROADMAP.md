# ROADMAP — TicketBlitz / SeatGuard

Phase-by-phase build plan. Priorities: **P0** (do first / blocking) → **P3** (later). "DoD" = Definition of Done.

---

## Phase 0 — Repo cleanup & setup
**Goal:** make the repo honest, unambiguous, and easy to work in.

| Task | Priority | Files | DoD | Risk |
|---|---|---|---|---|
| Pick one name (TicketBlitz vs SeatGuard) | P1 | `package.json`, `README.md`, docs | Single consistent name everywhere | Low |
| ~~Rewrite README to match reality~~ ✅ DONE | P1 | `README.md` | No claims that contradict the code | Low |
| ~~Decide Kafka/Redis subsystem~~ ✅ DONE (deleted) | P1 | `src/worker.ts`, `src/lib/{redis-lock,kafka-utils}.ts`, `kafkajs`/`ioredis` | Dead code + deps removed; tests updated | — |
| Remove stale deploy artifacts | P2 | `Procfile`, `deploy-ticketblitz.sh` | Removed or documented as unused | Low |
| Resolve `prisma.config.ts` mismatch | P2 | `prisma.config.ts` | Deleted (v5) or Prisma upgraded to 6 | Low |
| Unify seed counts (100 vs 10,000) | P2 | `prisma/seed.ts`, `ensureSeedData` | One documented number | Low |

## Phase 1 — MVP completion
**Goal:** the auth build is live and trustworthy.

| Task | Priority | Files | DoD | Risk |
|---|---|---|---|---|
| Redeploy auth build; set `JWT_SECRET` on Render | P0 | Render env, branch `89c69c1`+ | Live site requires login to book; live E2E passes | Med (migration on prod DB) |
| Move to dedicated Neon DB (de-risk leaked credential) | P0 | `DATABASE_URL`, `render.yaml` | SeatGuard no longer shares `contextlens-pg`; old credential irrelevant | Med |
| Integration tests for `/api/auth/*` + `/api/book-async` | P0 | new `tests/api.test.ts`, refactor `src/index.ts` to export `buildApp` | Tests cover register/login/401/booking/409/concurrency; run in CI with Postgres service | Med |
| Reset demo grid post-deploy | P2 | DB | Fresh grid for visitors | Low |
| Merge `production-deploy-prep` → `main` (runs CI + first real Docker build) | P1 | PR | CI green incl. Docker build | Low |

## Phase 2 — Production readiness
**Goal:** safe for real (small-scale) users.

| Task | Priority | Files | DoD | Risk |
|---|---|---|---|---|
| Multi-event support (event-scoped seats) | P1 | `src/index.ts` (`/api/seats?eventId`, book by `eventId+number`), `client/src/App.tsx` | Two events bookable independently | Med |
| ~~Seat holds with expiry (reserve → confirm)~~ ✅ DONE | P1 | `src/index.ts`, schema (`heldUntil`, `heldBy`), `Booking.idempotencyKey` | Held seat blocks others until TTL; reaper releases it; idempotent confirm; integration-tested | — |
| Replace fake telemetry with real `/metrics` or remove it | P1 | `Visualizer.tsx`, new metrics route | UI shows real data or panel removed | Low |
| `Seat.status` → enum; drop/justify `Seat.version` | P2 | `prisma/schema.prisma` + migration | Type-safe status | Low |
| Password reset + email verification | P2 | `src/index.ts`, email provider | Flows work end-to-end | Med |
| Token hardening (httpOnly cookie + CSRF, short TTL + refresh) | P2 | `src/index.ts`, `client/` | No token in `localStorage`; refresh works | Med |
| OpenAPI/Swagger docs | P2 | `@fastify/swagger` | `/docs` API spec served | Low |

## Phase 3 — Scaling & advanced features
**Goal:** handle real load and richer use cases.

| Task | Priority | Files | DoD | Risk |
|---|---|---|---|---|
| Connection pooling (PgBouncer / Prisma Accelerate) | P2 | `DATABASE_URL` | Stable under concurrent load | Med |
| Payments (Stripe) on confirm | P2 | new payment routes, webhooks | Paid bookings; idempotent webhook | High |
| Build a queue/worker path for spikes (only if load justifies it) | P3 | new worker service, `k8s/` | Worker consumes + books + tested | High |
| Organizer/admin role + event CRUD UI | P3 | API + new client views | Organizers create events & watch sales | Med |
| Horizontal scaling (verify Socket.io with adapter) | P3 | `k8s/`, redis socket.io adapter | Multi-instance real-time works | Med |

## Phase 4 — Polish, launch, analytics, monitoring
**Goal:** credible, observable, accessible launch.

| Task | Priority | Files | DoD | Risk |
|---|---|---|---|---|
| Accessibility pass | P2 | `client/src/*` | Seats are buttons; ARIA; non-color status; keyboard nav; contrast | Low |
| Real monitoring/alerting (uptime, error rate, p95) | P2 | tracing collector / Render metrics | Dashboards + alerts live | Med |
| Defensible load-test results | P2 | `load-test.js`, CI | Documented "0 double-bookings @ N VUs" + throughput numbers | Low |
| Launch polish (empty states, errors, loading, branding) | P3 | `client/` | Consistent UX | Low |
| Product analytics (funnel: visit→register→book) | P3 | client + backend events | Conversion measurable | Low |

---

### Critical path (shortest route to "real, trustworthy product")
`P0 redeploy auth` → `P0 dedicated DB` → `P0 API/auth tests` → `P1 multi-event` → `P1 holds` → `P2 payments`.

---

# Strategy-aligned roadmap (v2)

Added from the founder/engineering strategy (`docs/FUTURE_IMPLEMENTATION_STRATEGY.md`,
`docs/FEATURE_PRIORITIZATION.md`, `docs/V2_ARCHITECTURE_PROPOSAL.md`). Positioning:
**high-contention reservation engine**, not a generic ticketing app.

## Phase 1 — Immediate high-impact (credibility per effort)
- **Tasks:** F2 integration tests + export `buildApp`; F1 load-test + correctness metrics; F11 README/telemetry honesty; redeploy auth + dedicated Neon DB.
- **Priority:** P0. **Difficulty:** Low–Med. **Files:** `src/index.ts` (export refactor), `tests/api.test.ts`, `load-test.js`, `.github/workflows/ci.yml`, `README.md`, `client/src/components/Visualizer.tsx`.
- **Dependencies:** none (tests unblock the rest).
- **DoD:** live build is the auth build on a dedicated DB; integration tests in CI; a k6 run with **oversell=0** + p95 recorded; README matches reality.
- **Metrics to prove success:** test coverage of `src/index.ts` handlers; k6 `oversell_total=0`, p95, RPS (see `docs/METRICS_AND_OUTCOMES.md`).

## Phase 2 — Production readiness
- **Tasks:** F3 seat holds + idempotency; F4 `/metrics` (Prometheus) + OTel collector + Grafana; F5 Redis (rate-limit store + Socket.io adapter + holds backing); F6 multi-event (event-scoped seat lookup); F12 notifications via BullMQ; F8 CI/CD auto-deploy + real Docker build + load-test gate.
- **Priority:** P1. **Difficulty:** Med–High. **Files:** `prisma/schema.prisma` (+migrations), `src/index.ts`, `client/src/App.tsx`, a new Redis layer (net-new), `.github/workflows/ci.yml`.
- **Dependencies:** Phase 1 tests; managed Redis (Upstash) + dedicated Postgres (Neon).
- **DoD:** hold→confirm with TTL + idempotency; dashboards showing p95/contention/oversell; multi-instance real-time via Redis adapter; multiple events bookable.
- **Metrics:** holds_active, hold→booking conversion, 409 contention rate, oversell=0 under multi-instance load.

## Phase 3 — Advanced differentiators
- **Tasks:** F7 payments (Stripe, idempotent webhook); F10 organizer/admin role + event CRUD UI; F13 httpOnly cookie + refresh tokens; F9 my-bookings.
- **Priority:** P2. **Difficulty:** Med–High. **Files:** new payment routes/webhooks, role checks in `src/index.ts`, client views.
- **Dependencies:** holds (F3) before payments.
- **DoD:** paid bookings with idempotent webhooks; organizers manage events; hardened auth.
- **Metrics:** payment success rate, webhook idempotency hits, checkout conversion.

## Phase 4 — Cloud/AI infrastructure (only where justified)
- **Tasks:** containers→registry→**EKS** (use `k8s/` + Redis Socket.io adapter), **RDS**/**ElastiCache**, **Terraform** IaC, full OTel→Tempo + Prometheus/Grafana; **optional** LangGraph demand-insights agent (read-only, scheduled — `docs/TECH_STACK_UPGRADE_ANALYSIS.md`).
- **Priority:** P3. **Difficulty:** High. **Files:** `Dockerfile`, `k8s/*`, new `terraform/`, worker service.
- **Dependencies:** real load to justify; Phase 2 observability.
- **DoD:** autoscaling multi-instance deploy with IaC and SLO dashboards; AI agent (if built) runs off the critical path.
- **Metrics:** autoscale behavior under k6 spike; SLO adherence (oversell=0, p95<300ms, 5xx<1%).
- **Avoid:** SageMaker, LangChain/agent-orchestration as core, DynamoDB as primary store, Kafka without a load reason.
