# TicketBlitz — Deployment Guide

This document is the authoritative, accurate deployment reference for the code as
it actually exists in this repository.

> ⚠️ **PUBLIC DEMO / STAGING ONLY — NOT PRODUCTION.**
> This deployment uses **mock authentication** (`userId` is treated as the user's
> email; anyone can book as anyone). It is safe to run as a public demo, but it
> is **NOT safe for real users, real payments, or real PII** until real
> authentication is implemented. Do not call this "production" until the items in
> the [security checklist](#production-security-checklist) marked *Manual* are done.

## Architecture (as deployed)

- **API** — Fastify + Prisma + Socket.io (`src/index.ts`). Needs **PostgreSQL only**.
- **Frontend** — React + Vite + socket.io-client (`client/`). Static build.

The API performs race-free bookings using an atomic conditional `UPDATE` in
PostgreSQL — no Redis or Kafka is involved. It also exposes Prometheus metrics
at `/metrics` and a real stats summary at `/api/stats`.

---

## Recommended platform: Render (API) + Vercel (frontend)

### 1. Backend → Render

The repo includes `render.yaml` (Blueprint). It provisions a free Postgres and a
web service.

| Setting | Value |
|---|---|
| Runtime | Node |
| Install command | `npm install` |
| Build command | `npm install && npm run build` |
| Start command | `npm run start:api` (= `prisma migrate deploy && node dist/index.js`) |
| Health check path | `/health` |
| Node version | 20+ (22 recommended) |

**Environment variables (Render dashboard):**

| Variable | Source / value |
|---|---|
| `DATABASE_URL` | Postgres connection string (set manually; append `?schema=<name>` when sharing a DB) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | **Required** — long random string (`openssl rand -hex 32`). API refuses to boot without it in production. |
| `FRONTEND_URL` | Your Vercel URL, e.g. `https://seatguard.vercel.app` (comma-separate multiple) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | Optional rate-limit tuning (defaults 100 / `1 minute`) |
| `PORT` | Injected automatically by Render — do not hardcode |

On first boot the API runs migrations and auto-seeds **100 seats** if the table
is empty, so the grid is never empty. To seed the full 10,000-seat dataset
instead, run `npm run db:seed` once (e.g. from a Render shell).

### 2. Frontend → Vercel

| Setting | Value |
|---|---|
| Root directory | `client` |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Framework preset | Vite |

**Environment variable:**

| Variable | Value |
|---|---|
| `VITE_API_URL` | The Render API URL, e.g. `https://ticket-blitz-api.onrender.com` |

After deploying the frontend, set `FRONTEND_URL` on the Render API to the Vercel
URL so CORS + WebSocket origins match, then redeploy the API.

---

## Alternative: Docker / Kubernetes

```bash
# Build the API image (Dockerfile at repo root)
docker build -t ticket-blitz-api .

# Local Postgres for development
docker-compose up -d
```

Kubernetes manifests live in `k8s/` (`deployment.yaml`, `service.yaml`,
`hpa.yaml`). Before applying, create the referenced config/secret objects:

```bash
kubectl create configmap ticket-blitz-config --from-literal=NODE_ENV=production
kubectl create secret generic ticket-blitz-secrets \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=JWT_SECRET='...'
kubectl apply -f k8s/
```

> Note: the k8s manifests expect an image named `ticket-blitz-api:latest` in a
> registry your cluster can pull from.

---

## Database setup & migrations

```bash
# Apply existing migrations (production)
npx prisma migrate deploy

# Create a new migration during development
npx prisma migrate dev --name <change>

# Seed full demo dataset (10,000 seats) — optional
npm run db:seed
```

The schema (`prisma/schema.prisma`) defines `User`, `Event`, `Seat`, `Booking`.
PostgreSQL is required; SSL (`?sslmode=require`) is recommended for hosted DBs.

---

## Required environment variables (summary)

**API (required):** `DATABASE_URL`, `NODE_ENV`, `JWT_SECRET`, `FRONTEND_URL`
(+ `PORT` if not injected by the platform).

**Tracing (optional):** `ENABLE_TRACING=true`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_SERVICE_NAME`. Tracing is off unless explicitly enabled.

---

## Production security checklist

- [x] No secrets committed; all config via env vars (`.env` is gitignored).
- [x] CORS + WebSocket origins restricted to `FRONTEND_URL` (+ localhost), not `*`.
- [x] All mutating endpoints validate the body with Zod (400 on bad input).
- [x] Race-free booking via atomic conditional update (no double-booking).
- [x] **Rate limiting** on all endpoints via `@fastify/rate-limit` (per-IP,
      configurable with `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`; `/health` exempt).
- [x] Error handler sanitizes 5xx responses (no stack traces / internals leaked).
- [x] DB errors logged server-side only; clients get generic messages.
- [x] Health check endpoint (`/health`) — no DB, no auth — for platform probes.
- [x] Graceful shutdown on SIGINT/SIGTERM (drains server, disconnects Prisma).
- [x] Container runs as non-root (`USER node`).
- [x] First-deploy migration flow is safe: `prisma migrate deploy` applies only
      committed migrations (no schema drift / no destructive reset).
- [x] **Real authentication** (self-hosted JWT, bcrypt-hashed passwords).
      Register/login/me endpoints; booking is auth-gated and the user is taken
      from the verified token (never the request body). Login is rate-limited.
      Requires `JWT_SECRET`. *(Implemented in code; the LIVE demo still runs the
      pre-auth build until the next redeploy.)*
- [x] **Production dependency audit clean**: `npm audit --omit=dev` → 0
      vulnerabilities (remaining advisories are dev-only/tooling, 19 moderate).
- [ ] **Manual:** rotate the demo Postgres credentials in `docker-compose.yml`
      and the CI service block before any non-local use.
- [ ] **Manual:** the remaining 19 `npm audit` advisories are **dev-only**
      (tooling/transitive); production deps are clean. Review periodically.
- [ ] **Manual:** put the API behind HTTPS (Render/Vercel provide TLS by default).
- [ ] **Manual:** redeploy so the live site picks up the auth build, then set a
      strong `JWT_SECRET` on Render. Consider httpOnly-cookie token storage if you
      need defense-in-depth beyond the current Authorization-header/localStorage.
