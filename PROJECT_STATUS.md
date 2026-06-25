# TicketBlitz / SeatGuard — Project Status & Next Steps

_Last updated: 2026-06-25._
_This file is the single source of truth for "where are we and what's left." Read it first next session._

---

## TL;DR

- **Live demo is up** at https://seatguard.vercel.app (frontend) + https://ticket-blitz-api-mve9.onrender.com (API).
- The **LIVE site runs the PRE-AUTH build** (mock auth — anyone can book as anyone). Label it **public demo / staging, NOT production**.
- The branch `production-deploy-prep` is now **well ahead of the live site** (latest commit `3e57cfe`). On top of real JWT auth it adds: an **honesty pass** (removed unwired Kafka/Redis + rewrote the README), **real metrics** (`/metrics` + `/api/stats`), **live-path integration tests + a CI oversell gate**, **seat holds + idempotency**, and **real benchmark numbers** (`docs/BENCHMARKS.md`). None merged to `main`, **none deployed yet**.
- **Next time:** redeploy the latest build (set `JWT_SECRET` on Render + redeploy API and Vercel), open the PR to `main` (runs CI incl. the new oversell gate + first real Docker build), and de-risk the exposed DB password.

---

## Live deployment (current)

| Resource | Value |
|---|---|
| Frontend (Vercel, project `seatguard`) | https://seatguard.vercel.app |
| API (Render, `ticket-blitz-api`, oregon) | https://ticket-blitz-api-mve9.onrender.com |
| Health | https://ticket-blitz-api-mve9.onrender.com/health |
| Database | **Reuses `contextlens-pg`** (Render free Postgres, shared with the contextlens app) via `DATABASE_URL=...contextlens?schema=seatguard` (schema-isolated) |
| Render env vars set | `NODE_ENV=production`, `DATABASE_URL` (manual), `FRONTEND_URL=https://seatguard.vercel.app` |
| Vercel env vars set | `VITE_API_URL=https://ticket-blitz-api-mve9.onrender.com` (Production) |
| Render deploy mode | Node runtime via Blueprint `render.yaml` (NOT Docker). Build `npm install && npm run build`, start `npm run start:api`, health `/health` |

**What is verified working live (pre-auth build):** health, `/api/seats` (100 seats), booking 200, rebook 409, invalid 400, CORS for the Vercel origin, Socket.io handshake + real-time `seat-update` broadcast. All passed.

> Note: demo seats may show several BOOKED from testing. To reset, run in the DB:
> `UPDATE seatguard."Seat" SET status='AVAILABLE'; DELETE FROM seatguard."Booking";`

---

## Branch state

- Working branch: **`production-deploy-prep`** (pushed to `samarthshete/SeatGuard`). Not merged to `main`.
- Commits (newest last):
  - `ac94172` — deployment-prep: fix build/startup, rate limit, error handler, Dockerfile, ESLint flat config, docs.
  - `a9c5ec8` — render.yaml: external/shared Postgres + schema isolation.
  - `89c69c1` — real auth (JWT) + rate-limit tuning + prod npm audit clean.
  - `05153d5` — add this PROJECT_STATUS handoff.
  - `d2e2eae` — **honesty pass**: remove unwired Kafka/Redis, add real `/metrics` + `/api/stats`, rewrite README, fix the load test.
  - `5079376` — record real benchmark results (`docs/BENCHMARKS.md`).
  - `69e8648` — **live-path integration tests** + a real **CI oversell gate**.
  - `3e57cfe` — **seat holds + idempotency** (reserve→confirm→expire + reaper). ← latest.

---

## What's DONE (in code, verified locally)

- Race-free booking (atomic conditional `updateMany`), Zod validation, env-driven CORS (HTTP + Socket.io), graceful shutdown, idempotent bootstrap seed (100 seats), `/health`.
- Rate limiting (`@fastify/rate-limit`, per-IP, `/health` exempt, login stricter, tunable via `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW`).
- Sanitizing error handler (no stack traces in 5xx).
- **Real authentication** (self-hosted JWT, bcrypt): `register` / `login` / `me`; booking auth-gated; `userId` from token, not body; `JWT_SECRET` required in prod (refuses to boot without it). Frontend `AuthPanel` (login/register), token in localStorage, `Authorization` header, 401 → re-login.
- **Production `npm audit` clean (0 vulns)**; 19 remaining are dev-only. OTel bumped to patched majors; `tracing.ts` opt-in via `ENABLE_TRACING`.
- **Honesty pass:** deleted the unwired Kafka/Redis subsystem (`worker.ts`, `lib/redis-lock.ts`, `lib/kafka-utils.ts` + deps); rewrote the README and reconciled `docs/` to match the real system.
- **Real metrics:** `src/metrics.ts` (prom-client) → `GET /metrics`; `GET /api/stats` (real seat/booking/hold counts) drives the UI dashboard (the old fabricated "telemetry" counters are gone).
- **Seat holds + idempotency:** `POST /api/holds` (AVAILABLE→HELD, TTL `HOLD_TTL_SECONDS`=120s), `POST /api/holds/:n/confirm` (idempotency key dedups retries), background reaper (`releaseExpiredHolds`/`startReaper`). UI: two-step hold→confirm with countdown. Migration `20260625120000_add_holds`.
- **Tests + CI:** `tests/api.test.ts` Fastify-inject integration suite (auth, booking 200/409, holds, idempotency, expiry, reaper) — **22 tests pass against Postgres**, auto-skips without `DATABASE_URL`. CI now migrates before Jest and runs a real **oversell gate** that fails the build on any double-booking.
- **Benchmarks (real, local-dev):** oversell=0 at 20 & 50 concurrent; read p95 ~24ms (`docs/BENCHMARKS.md`); concurrency reproducible via `npm run concurrency-check`.
- New migration `20260624205138_add_user_password` (non-destructive; adds nullable `password`).
- Gates green: root typecheck/lint/test/build + client lint/build.

---

## PENDING — do these next time (in order)

1. **Redeploy the latest build to Render**
   - Render → `ticket-blitz-api` → Environment → add `JWT_SECRET` = output of `openssl rand -hex 32`.
   - Deploy the branch tip `3e57cfe`. `prisma migrate deploy` applies the password + `add_holds` migrations automatically.
   - Verify: register → login → book-with-token (200) → book-without-token (401); hold a seat → confirm → BOOKED; `curl /metrics` and `/api/stats` return real counts.

2. **Redeploy the frontend to Vercel** (auth UI)
   - From `client/`: `vercel --prod` (project `seatguard`). `VITE_API_URL` unchanged.
   - Verify login/register works in the browser and booking requires login.

3. **Re-run the live end-to-end check** including the real register→login→book flow and two-tab real-time update.

4. **(Decision) Merge `production-deploy-prep` → `main`**
   - Opening the PR runs GitHub Actions CI (install/lint/typecheck/build/test) **and the first real Dockerfile build** (Docker was never built locally — daemon was down). PR link:
     `https://github.com/samarthshete/SeatGuard/pull/new/production-deploy-prep`

5. **(Strongly recommended) De-risk the exposed DB password**
   - The `contextlens_user` Postgres password was pasted in chat → compromised, and that DB is shared with the live contextlens app.
   - Best fix: move SeatGuard to its own free **Neon** Postgres (set `DATABASE_URL` to the Neon **direct** connection string with `?sslmode=require`), then it no longer depends on the burned/shared credential.

---

## Remaining risks / honesty checklist

- **Live site = mock auth** until step 1–2 are done. Not production.
- **Exposed shared DB password** (see pending #5) — highest-priority cleanup.
- **Docker not built locally** (daemon down) — irrelevant to the live Render Node deploy; will get its first real build in CI when the PR is opened.
- **Render free tier:** cold starts (~30–60s after idle); free Postgres not durable long-term.
- **No Kafka / Redis:** the API is a single PostgreSQL-backed service; the earlier unwired Kafka/Redis experiment was removed so the repo matches what actually runs.
- **Token storage:** JWT in localStorage + Authorization header (fine for a demo). For hardened production consider httpOnly cookies + CSRF protection.
- `prisma.config.ts` targets Prisma 6+ but Prisma is pinned at 5.x — currently ignored; matters on a Prisma upgrade.

---

## Local dev / verification quick reference

```bash
# Root (API)
npm ci && npm run typecheck && npm run lint && npm test && npm run build
# Client
cd client && npm ci && npm run lint && npm run build
# Required env for the API in production: DATABASE_URL, NODE_ENV, JWT_SECRET, FRONTEND_URL
```
See `DEPLOYMENT.md` for full deployment settings and the security checklist.
