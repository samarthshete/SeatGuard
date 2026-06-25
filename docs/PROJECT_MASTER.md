# PROJECT MASTER — TicketBlitz (deployed as "SeatGuard")

> The authoritative deep-dive on what this project actually is, based on the code in this repo — not the marketing README.

---

## Project name
- Repo / package name: **ticket-blitz** (`package.json`).
- GitHub remote + deployed name: **SeatGuard** (`github.com/samarthshete/SeatGuard`, Vercel project `seatguard`).
- Both names refer to the same project. (Naming is inconsistent — see `docs/DECISIONS.md`.)

## One-line description
A real-time, high-concurrency **seat-booking demo** that proves a single seat can't be double-booked under load, with a live React grid that updates across clients via WebSockets.

## Product vision
Showcase a correct, race-free booking system (the hard part of any ticketing/reservation product) with a visible, real-time UI — as a portfolio/engineering demonstration that can evolve into a real reservation backend.

## Problem being solved
**Concurrent booking of a limited resource without double-selling it.** When thousands of users race for the same seat, naive "check-then-write" logic double-books. This project demonstrates a correct atomic-claim approach and contrasts it with the naive one.

## Why this problem matters
Double-booking is a real, expensive failure mode in ticketing, travel, events, and any inventory system. Getting concurrency correct is the core engineering challenge; it directly affects revenue, trust, and refunds.

## Target users
- **Primary (today):** the author + technical reviewers/recruiters evaluating the engineering (it's a demo).
- **If productized:** event organizers and attendees booking seats for an event.
- Evidence it's a demo: seeded single event "The Eras Tour" (`prisma/seed.ts`), mock-ish `/api/book-naive`, and a fabricated "Engineering Telemetry" panel (`client/src/components/Visualizer.tsx`).

## Main user workflows
1. **Browse seats** — frontend fetches `GET /api/seats` and renders a 100-seat grid (`client/src/App.tsx`).
2. **Register / log in** — `AuthPanel` → `POST /api/auth/register` or `/api/auth/login`; JWT stored in `localStorage` (`client/src/components/AuthPanel.tsx`).
3. **Book a seat** — click a green seat → `POST /api/book-async` with `Authorization: Bearer <token>`; server atomically claims it.
4. **See it live** — server emits Socket.io `seat-update`; all open clients turn that seat red in real time.

## Initial idea → evolution
- Started as a **distributed-systems showcase**: API + Kafka event queue + Redis distributed lock + worker + OpenTelemetry + k8s/HPA. The old README described this architecture (Kafka exactly-once, etc.) — but it **was never wired into the running API**.
- Reality was always **a single atomic DB write**: booking is a direct, race-free conditional `UPDATE` (`src/index.ts`). The Kafka worker, Redis lock, and Kafka serializer were never imported by the API.
- Honesty pass (this engagement): **deleted** the unwired Kafka/Redis subsystem (`src/worker.ts`, `src/lib/{redis-lock,kafka-utils}.ts` + their tests + `kafkajs`/`ioredis`), **rewrote the README** to match the real system, added **real metrics** (`/metrics` + `/api/stats`, with the UI dashboard wired to real data), and added **reproducible load/concurrency tooling** (`scripts/concurrency-check.mjs`, rewritten `load-test.js`, `docs/BENCHMARKS.md`).
- Earlier hardening: fixed a startup crash, added Zod validation, env-driven CORS, rate limiting, a sanitizing error handler, graceful shutdown, an idempotent bootstrap seed, then **real JWT authentication** (booking requires login; `userId` comes from the token, not the body).

## Current state
- **Live as a public demo/staging** — Frontend: https://seatguard.vercel.app · API: https://ticket-blitz-api-mve9.onrender.com.
- The **live build still uses pre-auth code**; the **auth build is committed on branch `production-deploy-prep` (commit lineage `ac94172 → a9c5ec8 → 89c69c1 → 05153d5`) but not yet redeployed**. See `PROJECT_STATUS.md` (repo root) for the live-vs-branch split.
- All quality gates pass locally (typecheck, lint, tests, build); production `npm audit` is clean.

## Final intended product
A correct, authenticated, real-time reservation backend + UI that can host real events with real seat inventory, real users, payments, and operational observability. The distributed pieces (queue/worker) would return only if/when throughput demands them.

## Core features (implemented)
- Atomic, race-free seat claim (`POST /api/book-async`, `src/index.ts`).
- Real-time seat updates via Socket.io.
- JWT auth: register / login / me; auth-gated booking (branch build).
- Input validation (Zod), per-IP rate limiting, sanitized errors, `/health`, graceful shutdown.
- Idempotent bootstrap seed (100 seats on first boot).

## MVP scope
- One event, 100 seats, register/login, book a seat (race-free), live grid. **This is essentially complete on the auth branch.**

## Non-MVP / future scope
- Multiple events; seat selection scoped per event (current `findFirst({where:{number}})` assumes one event).
- Seat holds/timeouts (reserve → confirm), payments, refunds.
- Real queue/worker path for extreme load (the existing Kafka/Redis code, finished and tested).
- Real observability (the current "telemetry" panel is cosmetic).
- Email verification, password reset, refresh tokens / token revocation.

## Full technical architecture
See `docs/ARCHITECTURE.md` for diagrams. Summary: **monorepo-ish** with a Fastify/TypeScript API at the root (`src/`) and a React/Vite SPA in `client/`, talking over REST + Socket.io, backed by PostgreSQL via Prisma. Deployed as Render (API, Node runtime) + Vercel (static SPA).

## Frontend architecture
- React 19 + Vite 7 SPA, single screen (`client/src/App.tsx`).
- Components: `AuthPanel.tsx` (auth), `Visualizer.tsx` (**Live Stats** — real Booked/Available/Conflicts fetched from `GET /api/stats`).
- State: local `useState` only (no router, no global store). API base from `VITE_API_URL`.

## Backend architecture
- Single-file Fastify app (`src/index.ts`): plugins registered before routes (`buildApp`), then `ensureSeedData`, then `listen`, then Socket.io attached to the HTTP server.
- Prisma client for DB access. JWT via `@fastify/jwt`, hashing via `bcryptjs`.
- `src/metrics.ts` — Prometheus registry + real booking counters (`/metrics`, `/api/stats`).
- `src/tracing.ts` — opt-in OpenTelemetry.
- **Unused in the live path:** `src/lib/state-machine.ts` (only its test references it). The former Kafka/Redis subsystem was removed.

## Database / data model
PostgreSQL via Prisma (`prisma/schema.prisma`): `User`, `Event`, `Seat`, `Booking`. `Seat.status` is a free-text string (`AVAILABLE`/`BOOKED`), `Seat.version` exists but is **unused** (no optimistic locking implemented). Migrations: `20260112172212_init`, `20260624205138_add_user_password`. Full ERD in `docs/ARCHITECTURE.md`.

## API design
REST + JSON. Endpoints: `GET /health`, `GET /metrics`, `GET /api/stats`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/seats`, `GET /api/random-seat`, `POST /api/book-async`, `POST /api/book-naive`. No OpenAPI/Swagger spec (**Not found in current codebase**).

## Auth / session flow
Stateless JWT. Register/login return a signed token (`{ id, email }`); client sends it as `Authorization: Bearer`; `authenticate` preHandler verifies it on protected routes; `userId` is taken from the token, never the request body. No refresh tokens, no revocation, no email verification. `JWT_SECRET` required in production.

## Agent / AI / LLM flow
**Not found in current codebase.** No LLM/AI usage. (There are OpenTelemetry instrumentation packages for OpenAI in the transitive tree, but nothing is wired up.)

## External services used
- **PostgreSQL** (live: Render `contextlens-pg`, shared via `?schema=seatguard`).
- **Render** (API hosting), **Vercel** (frontend hosting).
- Optional: an OTLP tracing collector (off by default); a Prometheus scrape of `/metrics`. No Redis/Kafka.

## Deployment architecture
Render Web Service (Node runtime via `render.yaml` Blueprint; build `npm install && npm run build`, start `npm run start:api` = `prisma migrate deploy && node dist/index.js`, health `/health`) + Vercel SPA (`VITE_API_URL` → Render URL). `Dockerfile`, `k8s/`, `Procfile` exist but are **not used by the live deploy**. Details in `DEPLOYMENT.md`.

## Security considerations
Done: bcrypt password hashing, JWT, token-derived `userId`, Zod validation on all mutating routes, restricted CORS (`FRONTEND_URL`), per-IP rate limiting (stricter on login), sanitized 5xx, `JWT_SECRET` required in prod. Gaps: JWT in `localStorage` (XSS exposure), no refresh/revocation, no email verification/password reset, **a real DB credential was exposed in chat and is shared with another live app** (see `PROJECT_STATUS.md`). More in `docs/IMPLEMENTATION_STATUS.md`.

## Performance considerations
Booking is a few indexed queries + one conditional `UPDATE`; cheap. Hot read is `GET /api/seats` (full table scan of 100 rows; fine now, would need pagination/caching at scale). Load/concurrency tooling is real and reproducible (`scripts/concurrency-check.mjs`, `load-test.js`) but numbers must be generated against a live API — see `docs/BENCHMARKS.md`. Live counters available at `/metrics` and `/api/stats`.

## Scalability considerations
The atomic-claim approach scales horizontally (DB is the single source of truth). Bottleneck would be Postgres write contention on hot seats and connection limits (Render free tier). A queue/worker could absorb spikes if load ever justified it, but none is built. Single-event assumption blocks multi-event scale.

## Accessibility considerations
Minimal. Seats are clickable `<div>`s (not buttons), no ARIA on the grid, color-only status encoding (red/green) — **fails color-blind accessibility**. `AuthPanel` inputs have `aria-label`s. Needs work (`docs/ROADMAP.md` Phase 4).

## SEO / agent-readability considerations
SPA with a single `index.html`; no SSR, no meta tags, no sitemap/robots. SEO is irrelevant for a logged-in app but currently nonexistent. `docs/ONBOARDING_FOR_AI_AGENTS.md` covers agent readability of the repo.

## Known limitations
- Single hardcoded event; seat lookup by number isn't event-scoped.
- Tests cover the state machine + metrics module — **zero tests on the live API/auth/booking handlers** yet.
- `Seat.version` is dead (no optimistic locking implemented).

## Risks
- Exposed/shared DB credential (highest priority).
- Misleading docs/tests could cause a future contributor to trust coverage that doesn't exist.
- Render free-tier cold starts and a shared/ephemeral DB.

## Open questions
- Settle the name: TicketBlitz vs SeatGuard.
- Multi-event support: in scope or stay single-event demo?
- Token storage: move to httpOnly cookies?

## Final outcome & expected impact
As-is: a credible, working demo of correct concurrent booking + real-time UI + real auth — strong portfolio evidence. With the roadmap executed, it becomes a small but genuinely production-shaped reservation service.
