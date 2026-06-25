# ONBOARDING FOR AI AGENTS — TicketBlitz / SeatGuard

Read this first if you're an AI agent (Claude/Cursor/Codex) working on this repo. It gets you productive fast and keeps you from breaking things.

---

## Project summary
Real-time, race-free **seat-booking** demo. Fastify + Prisma + PostgreSQL + Socket.io API (`src/`) and a React + Vite SPA (`client/`). JWT auth. Live on Render (API) + Vercel (frontend). Aka **SeatGuard** (deployed) / **TicketBlitz** (package). It's a strong **demo**, not yet a full product.

## Ground truth & status
- The **README now matches the code** (Fastify + Prisma + Postgres + Socket.io). The old aspirational Kafka/Redis/50k-benchmark README and the unwired Kafka/Redis code have been removed. Still cross-check `/docs` and the code.
- **Live deployment runs a PRE-AUTH build.** Real JWT auth is on branch **`production-deploy-prep`**, **not yet redeployed**. See `PROJECT_STATUS.md` (repo root).
- Authoritative docs: `docs/PROJECT_MASTER.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_STATUS.md`, `PROJECT_STATUS.md`, `DEPLOYMENT.md`.

## Important files
| Path | What it is |
|---|---|
| `src/index.ts` | **The entire API** — plugins, auth, routes, booking, `/metrics`, `/api/stats`, seed, startup. Start here. |
| `src/metrics.ts` | Prometheus registry + real booking counters (used by `/metrics` and `/api/stats`). |
| `src/tracing.ts` | Opt-in OpenTelemetry (`ENABLE_TRACING`). |
| `prisma/schema.prisma` | Data model (User/Event/Seat/Booking). |
| `prisma/migrations/` | `init` + `add_user_password`. |
| `prisma/seed.ts` | Seeds 1 event + 10,000 seats (manual). Bootstrap seed in `src/index.ts` makes 100. |
| `client/src/App.tsx` | SPA: seat grid, fetch, Socket.io, booking, live stats. |
| `client/src/components/AuthPanel.tsx` | Login/register UI. |
| `client/src/components/Visualizer.tsx` | "Live Stats" panel — **real** data from `/api/stats`. |
| `scripts/concurrency-check.mjs` / `load-test.js` | Oversell correctness proof (no-k6) / k6 load test. |
| `render.yaml` / `DEPLOYMENT.md` | Deploy config + guide. |
| `src/lib/state-machine.ts` | Generic booking state machine — unused in the live path (only its test references it). |

## How to run locally
```bash
# 1. Infra (Postgres — the only service the API needs)
docker-compose up -d
# 2. API deps (postinstall runs `prisma generate`)
npm install
# 3. Env
cp .env.example .env   # set DATABASE_URL, JWT_SECRET (any string in dev), FRONTEND_URL
# 4. Migrate
npx prisma migrate deploy
# 5. Run API (http://localhost:3000) — auto-seeds 100 seats on first boot
npm run dev:api
# 6. Frontend (http://localhost:5173)
cd client && npm install && npm run dev
```
Verify: `npm run typecheck && npm run lint && npm test && npm run build` (root) and `cd client && npm run lint && npm run build`.

> No Postgres handy? The pattern used in this repo's history is an ephemeral local cluster; any Postgres URL in `DATABASE_URL` works.

## How the app works (booking, the core flow)
1. SPA loads seats via `GET /api/seats`, opens a Socket.io connection.
2. User registers/logs in → JWT stored in `localStorage`.
3. Click a seat → `POST /api/book-async` with `Authorization: Bearer <jwt>`, body `{ seatNumber }`.
4. Server: rate-limit → verify JWT → Zod validate → **atomic** `updateMany({where:{status:'AVAILABLE'}})` (this is the anti-double-booking guard) → create `Booking` → `io.emit('seat-update')`.
5. All clients update live.

## Coding conventions
- TypeScript strict; CommonJS for the API (`tsconfig.json`), ESM for the client.
- ESLint flat config: root `eslint.config.js`, client `client/eslint.config.js`. Prettier (`.prettierrc`).
- 2-space indent; named exports for libs; Zod for all request validation; Fastify `reply.status(n).send({error})` for errors.
- Always derive identity from the JWT (`request.user`), **never** from the request body.
- Run the gates before committing. Keep diffs small and reviewable.

## Where to add new features
- **New API route:** add inside `buildApp()` in `src/index.ts`. Protect mutations with `{ preHandler: instance.authenticate }`. Validate with a Zod schema. (If the file grows, split into `src/routes/*` + `src/plugins/*` — see `docs/ROADMAP.md` Phase 0.)
- **New data:** edit `prisma/schema.prisma` → `npx prisma migrate dev --name <change>` → use the generated client.
- **New UI:** add a component under `client/src/components/`, wire into `client/src/App.tsx`. API base = `import.meta.env.VITE_API_URL`.
- **Tests:** there are none for the live API yet. Add `tests/api.test.ts` using Fastify `inject`; you'll need to export `buildApp` (currently `main()` auto-runs).

## What NOT to touch without review
- **Booking atomicity** in `src/index.ts` (`updateMany` conditional) — it's the correctness core. Don't "simplify" to read-then-write.
- **Auth flow** (`/api/auth/*`, `authenticate`, token-derived `userId`) — security-critical.
- **`prisma/migrations/`** — never edit applied migrations; create new ones.
- **`DATABASE_URL` / secrets** — the live DB is shared (`?schema=seatguard`) and its credential is compromised; don't run destructive SQL against it. See `PROJECT_STATUS.md`.
- **Production deploy** — don't redeploy unless asked; the live site intentionally still runs the pre-auth build.

## Common mistakes to avoid
- Assuming the tests cover the API — they cover the state machine + metrics module, **not** the HTTP/auth/booking handlers yet.
- Re-introducing Kafka/Redis — the unwired subsystem was deliberately removed; only add a broker/queue with a real load justification (`docs/V2_ARCHITECTURE_PROPOSAL.md`).
- Adding `userId` back into the booking body — it must come from the token.
- Booking by seat `number` and assuming uniqueness across events — current code assumes a **single event**.
- Forgetting `JWT_SECRET` in production — the API refuses to boot without it.

## Next best tasks (high value, low ambiguity)
1. **Add integration tests** for `/api/auth/*` and `/api/book-async` (export `buildApp`, Fastify `inject`, test Postgres). Closes the biggest gap.
2. **Redeploy the auth build** + move to a **dedicated Neon DB** (de-risk the leaked shared credential).
3. **Fill in real benchmark numbers** — run `scripts/concurrency-check.mjs` + `load-test.js` against a live API and record them in `docs/BENCHMARKS.md`.
4. **Fix multi-event seat lookup** or document single-event scope.

See `docs/ROADMAP.md` for the full plan and `docs/IMPLEMENTATION_STATUS.md` for the honest gap list.
