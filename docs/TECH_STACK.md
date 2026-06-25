# TECH STACK — TicketBlitz / SeatGuard

Versions from `package.json` and `client/package.json`. "Appropriate?" is an honest call.

---

## Languages
| Lang | Where | Appropriate? |
|---|---|---|
| TypeScript (~5.9) | API (`src/`) + client (`client/src/`) | ✅ Yes |
| SQL | Prisma migrations | ✅ |
| Bash | `deploy-ticketblitz.sh` | ⚠️ interactive Railway/Vercel script, now superseded by Render Blueprint — stale |

## Backend frameworks / libraries
| Package | Version | Purpose | Appropriate? |
|---|---|---|---|
| `fastify` | ^5.6 | HTTP server | ✅ Fast, modern, good fit |
| `@fastify/cors` | ^11 | CORS | ✅ |
| `@fastify/rate-limit` | ^10 | Per-IP rate limiting | ✅ |
| `@fastify/jwt` | ^10 | JWT sign/verify | ✅ (v10 fixed a `fast-jwt` critical) |
| `bcryptjs` | ^2 | Password hashing | ✅ pure-JS (no native build → safe on Render). Consider `argon2` later |
| `@prisma/client` / `prisma` | ^5.10 | ORM + migrations | ✅ — but `prisma.config.ts` targets Prisma 6 API and is **ignored** on v5 (dead file) |
| `pg` | ^8 | Postgres driver (Prisma uses it) | ✅ |
| `zod` | ^4 | Request validation | ✅ |
| `socket.io` | ^4.8 | Real-time updates | ✅ for the scale; SSE would also work |
| `prom-client` | ^15 | Prometheus metrics (`/metrics`) | ✅ real server-side counters + latency histogram |
| `@opentelemetry/*` | 0.219 / 2.x / 1.40 | Tracing | ⚠️ opt-in only; large dep tree for an off-by-default feature |
| `dotenv` | ^17 | Env loading | ✅ |
| `fastify-plugin` | ^5 | (declared) | ⚠️ not referenced in `src/` — likely unused |

## Frontend frameworks / libraries
| Package | Version | Purpose | Appropriate? |
|---|---|---|---|
| `react` / `react-dom` | ^19.2 | UI | ✅ |
| `vite` | ^7 | Build/dev | ✅ |
| `socket.io-client` | ^4.8 | Real-time client | ✅ |
| `typescript-eslint`, `eslint` (9) | — | Lint (flat config) | ✅ |

## Database
- **PostgreSQL** via Prisma. Models in `prisma/schema.prisma`. Appropriate ✅. Note: `Seat.status` is free-text (should be an enum); `Seat.version` is unused.

## Auth
- **Self-hosted JWT** (`@fastify/jwt`) + **bcryptjs**. Stateless. Appropriate for the scale ✅. Missing: refresh tokens, revocation, email verification, password reset.

## Storage
- Only the relational DB. No object/file storage. **Not found in current codebase** (none needed yet).

## Deployment
| Tech | Used live? | Notes |
|---|---|---|
| **Render** (Node web service, `render.yaml`) | ✅ API | Appropriate for a demo |
| **Vercel** (`client/`) | ✅ Frontend | Appropriate ✅ |
| `Dockerfile` + `.dockerignore` | ❌ not in live path | Valid multi-stage, non-root; used only by CI/k8s |
| `k8s/` (`deployment`, `service`, `hpa`) | ❌ | Aspirational; references images not built/pushed |
| `Procfile` | ❌ | Heroku-style; unused |
| `docker-compose.yml` | local only | Postgres for local dev |
| `deploy-ticketblitz.sh` | ❌ | Stale Railway/Vercel script |

## DevOps / CI
- **GitHub Actions** (`.github/workflows/ci.yml`): `npm ci` → `prisma generate` → `npm run lint` → `tsc --noEmit` → `npm run build` → `jest --coverage` → `docker build`. A second `load-test` job only checks `load-test.js` exists (mocked). Appropriate ✅, but Docker build has never actually run (see `docs/IMPLEMENTATION_STATUS.md`).

## Monitoring / logging
- **Logging:** Fastify/pino structured logs (`Fastify({ logger: true })`). ✅
- **Tracing:** OpenTelemetry, opt-in (`src/tracing.ts`, `ENABLE_TRACING`). Off in prod (no collector).
- **Metrics:** **Real** — `GET /metrics` (Prometheus via `prom-client`: `bookings_total`, `booking_conflicts_total`, `http_request_duration_seconds`) and `GET /api/stats` (JSON seat/booking counts driving the UI). External dashboards (Grafana) not wired yet.

## Testing tools
- **Jest** + **ts-jest** (`jest.config.js`). 2 test files (`tests/state-machine.test.ts`, `tests/metrics.test.ts`), 8 tests.
- ⚠️ Still **zero tests for the live HTTP API, auth, or booking handlers** — that's the next testing priority. `scripts/concurrency-check.mjs` (no-k6 oversell proof) and `load-test.js` (k6) cover correctness/perf but must be run against a live API.

## AI / LLM tools
**Not found in current codebase.** No LLM/agent usage.

## Recommended stack changes
- ~~Remove or finish the Kafka/Redis/worker subsystem~~ — **DONE:** deleted `src/worker.ts`, `src/lib/{redis-lock,kafka-utils}.ts` and dropped `kafkajs`/`ioredis`. (`k8s/` API manifests remain as aspirational deploy config.)
- **Delete `prisma.config.ts`** (incompatible with pinned Prisma 5) or upgrade Prisma to 6 deliberately.
- **Make tracing truly optional** at dependency level (it dominates the dev-only audit noise) — or pin/upgrade and keep.
- **Convert `Seat.status` to a Prisma enum**; drop unused `Seat.version` or actually implement optimistic locking.
- **Remove stale deploy artifacts** (`Procfile`, `deploy-ticketblitz.sh`) or document them as unused.
