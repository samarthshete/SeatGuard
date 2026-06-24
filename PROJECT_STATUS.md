# TicketBlitz / SeatGuard — Project Status & Next Steps

_Last updated: 2026-06-24._
_This file is the single source of truth for "where are we and what's left." Read it first next session._

---

## TL;DR

- **Live demo is up** at https://seatguard.vercel.app (frontend) + https://ticket-blitz-api-mve9.onrender.com (API).
- The **LIVE site runs the PRE-AUTH build** (mock auth — anyone can book as anyone). Label it **public demo / staging, NOT production**.
- **Real JWT auth is built, tested, committed, and pushed** on branch `production-deploy-prep` (commit `89c69c1`) but is **NOT deployed yet**.
- **Next time:** redeploy the auth build (set `JWT_SECRET` on Render + redeploy API and Vercel), optionally merge to `main`, and de-risk the exposed DB password.

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
- Commits:
  - `ac94172` — deployment-prep: fix build/startup, rate limit, error handler, Dockerfile, ESLint flat config, docs.
  - `a9c5ec8` — render.yaml: external/shared Postgres + schema isolation.
  - `89c69c1` — **real auth (JWT) + rate-limit tuning + prod npm audit clean**. ← latest, contains the auth build.

---

## What's DONE (in code, verified locally)

- Race-free booking (atomic conditional `updateMany`), Zod validation, env-driven CORS (HTTP + Socket.io), graceful shutdown, idempotent bootstrap seed (100 seats), `/health`.
- Rate limiting (`@fastify/rate-limit`, per-IP, `/health` exempt, login stricter, tunable via `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW`).
- Sanitizing error handler (no stack traces in 5xx).
- **Real authentication** (self-hosted JWT, bcrypt): `register` / `login` / `me`; booking auth-gated; `userId` from token, not body; `JWT_SECRET` required in prod (refuses to boot without it). Frontend `AuthPanel` (login/register), token in localStorage, `Authorization` header, 401 → re-login.
- **Production `npm audit` clean (0 vulns)**; 19 remaining are dev-only. OTel bumped to patched majors; `tracing.ts` opt-in via `ENABLE_TRACING`.
- New migration `20260624205138_add_user_password` (non-destructive; adds nullable `password`).
- Gates green: root typecheck/lint/test/build + client lint/build.

---

## PENDING — do these next time (in order)

1. **Redeploy the auth build to Render**
   - Render → `ticket-blitz-api` → Environment → add `JWT_SECRET` = output of `openssl rand -hex 32`.
   - Deploy commit `89c69c1` (the branch). `prisma migrate deploy` applies the new password migration automatically.
   - Verify: register → login → book-with-token (200) → book-without-token (401).

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
- **Worker / Kafka / Redis:** not deployed (optional, untested).
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
