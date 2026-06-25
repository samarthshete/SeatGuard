# RESUME BULLET BANK — TicketBlitz / SeatGuard

> Single source of truth for resume bullets, role positioning, and defensible wording for this repo.
> Grounded in the actual code (`src/index.ts`, `prisma/schema.prisma`, `client/`, `render.yaml`, CI) and `/docs`. **No invented metrics. No claiming unbuilt work.**
>
> _Last updated: 2026-06-24._

---

## 0. Rules for Using This File

1. **Two-projects layout (space-tight):** use **2 projects × 3 bullets each**.
2. **Three-projects layout (projects are the main proof):** use **3 projects × 2 bullets each**.
3. **Only use bullets marked `READY`.** They are backed by code that exists and works.
4. **Never use bullets marked `PLANNED — DO NOT USE YET`.** Those describe work that is designed in `/docs` but **not built**. Using them is lying.
5. **Select by role fit, not preference.** Use the Role-to-Project Matrix (§1) to pick the bullet set per application.
6. **Never claim a tool or metric unless it is implemented AND (for metrics) measured.** Every number in this repo is currently **Not measured yet** — see `docs/METRICS_AND_OUTCOMES.md`. Until a real benchmark is run, use placeholders (`N`, `X ms`, `Y req/s`) or omit the number.
7. **One honesty caveat that affects wording:** real JWT auth is **built, tested locally, and committed** on branch `production-deploy-prep`, but the **live demo URL still serves the pre-auth build** (`PROJECT_STATUS.md`). Bullets here say "built/implemented," which is true of the code. Do **not** say "in production" for the authenticated build until it is redeployed.

### Bullet quality rules (applied to every READY bullet below)
- Strong action verb, **< 28 words**.
- Specific technical contribution (name the real mechanism, not a buzzword).
- Prefer **architecture + outcome**; outcome stays qualitative until a number is measured.
- No vague filler ("worked on," "helped with," "various technologies").
- No overclaiming (no Kafka/Redis/k8s/AI/observability that isn't running — those are dead code or unbuilt).

---

## ⚠️ Reality check before you use this (read once)

**This repository contains exactly ONE project** (TicketBlitz, deployed as SeatGuard). The Role-to-Project Matrix below treats SeatGuard as the **primary** project for every role. **Secondary / Optional-third columns are placeholders** — fill them from your *other* repos; I cannot verify projects that aren't in this repo, so I will not write bullets for them.

What is **real and defensible** in this repo:
- A deployed, race-free seat-booking system: **Fastify 5 + TypeScript + Prisma 5 + PostgreSQL + Socket.io 4**, React 19 / Vite 7 SPA, on **Render + Vercel**.
- A genuinely correct **atomic seat claim** (`prisma.seat.updateMany({ where: { status: 'AVAILABLE' } })`, `src/index.ts:214`) — the hard, real part.
- **Real JWT auth** (bcrypt, token-derived `userId`), Zod validation, per-IP rate limiting, sanitized errors, graceful shutdown, health check, CI pipeline, clean production `npm audit`.

What is **NOT real** (do not put on a resume):
- ❌ No load-test numbers, no p95/throughput, no measured "oversell = 0 at N VUs." (`METRICS_AND_OUTCOMES.md` = Not measured yet.)
- ❌ No tests on the live code — the 13 passing tests cover **dead** `src/lib/*` modules only (**0% coverage of live API/auth/booking**).
- ❌ No AI/LLM anywhere. No Kafka/Redis/Kubernetes in the running path (that code is dormant/dead).
- ❌ The "Engineering Telemetry" UI panel is **fabricated client-side** — never cite it as metrics.

---

## 1. Role-to-Project Matrix

| Role Target | Primary Project | Secondary Project | Optional Third | Why This Set Works | Avoid / Downplay |
|---|---|---|---|---|---|
| **Backend Engineer** | **SeatGuard** (concurrency correctness, atomic claim, auth, validation) | _[your 2nd backend/data project]_ | _[your 3rd]_ | Atomic conditional UPDATE under contention is a real backend-depth signal; auth + Zod + rate limiting show production instincts | Don't claim Kafka/Redis (dead code), AI, or load numbers |
| **Software Developer / SDE** | **SeatGuard** | _[your 2nd]_ | _[your 3rd]_ | End-to-end shipped system (API + SPA + DB + deploy + CI) shows you can build and ship, not just code snippets | Downplay the fake telemetry panel; don't imply tests cover the API |
| **Full-stack Engineer** | **SeatGuard** (React 19 SPA + real-time WebSocket + auth UI + Fastify API) | _[your 2nd full-stack]_ | _[your 3rd]_ | Real-time grid + optimistic UI + auth flow across the full stack with live deploy | a11y gaps; aspirational README; fake telemetry |
| **AI Engineer / Applied AI** | **❌ Do NOT lead with SeatGuard** — it has zero AI | _[your real AI/LLM project]_ | _[your 2nd AI project]_ | This repo has no AI; faking one is the fastest credibility loss with an AI reviewer | Do **not** position SeatGuard as AI. The LangGraph "demand agent" is `PLANNED`, unbuilt |
| **AWS / Cloud SDE** | _[your real AWS/IaC project]_ **or** SeatGuard as secondary | **SeatGuard** (Render+Vercel, `render.yaml`, CI, Docker/k8s manifests) | _[your 3rd]_ | SeatGuard shows deploy + CI literacy, but it's Render/Vercel, not AWS; the k8s/Docker bits are **unbuilt/never-built** so frame as "manifests authored," not "ran on EKS" | EKS/Terraform/Lambda are `PLANNED`; Docker image was never actually built |
| **Founding Engineer / Startup** | **SeatGuard** (0→1: built, deployed, hardened, documented solo) | _[your 2nd 0→1 project]_ | _[your 3rd]_ | Solo-shipped a working product slice with auth, deploy, CI, and brutally honest docs — exactly the founder-eng signal | Don't oversell scope; it's a high-contention reservation *engine*, not a full ticketing product |
| **AI Security / Agent Infrastructure** | **❌ No fit in this repo** | _[your real agent/security project]_ | _[your 2nd]_ | No agents, no LLM, no security-research surface here | Do not stretch SeatGuard into this lane |
| **Platform Engineer** | **SeatGuard** (CI gates, health checks, graceful shutdown, env-driven config, clean audit) | _[your 2nd infra/platform project]_ | _[your 3rd]_ | Operational hygiene (CI, health, shutdown, config, audit) is real; just don't claim the observability stack | `/metrics`, Prometheus, OTel-wired, Redis multi-instance are all `PLANNED` |

> If you only have SeatGuard, apply for **Backend / SDE / Full-stack / Founding Engineer** roles — those fit the real code. Treat **AI Engineer, AI Security, AWS/Cloud (as primary)** as roles you need a *different* project for.

---

## 2. SeatGuard — READY Bullets (use these)

All verbs and mechanisms below map to real code. Pick the subset that fits the role.

### Tier A — strongest (lead with these)

**A1 — Concurrency correctness (the headline)**
> Built a race-free seat-booking engine in TypeScript/Fastify using a single atomic conditional `UPDATE` (Prisma `updateMany … WHERE status='AVAILABLE'`), guaranteeing exactly one winner per seat under concurrent requests.

**A2 — Real-time system**
> Designed a real-time booking UI where seat state propagates to all connected clients over Socket.io, eliminating stale reads and double-click double-booking across browser sessions.

**A3 — Authentication & authorization (built + tested; branch build)**
> Implemented stateless JWT auth (bcrypt hashing, token-derived `userId` so a client can never book as another user) gating all mutating routes; API refuses to boot in prod without `JWT_SECRET`.

### Tier B — supporting (strong, role-dependent)

**B1 — API hardening**
> Hardened the Fastify API with Zod request validation on every mutating route, per-IP rate limiting (stricter on login), sanitized 5xx responses (no stack-trace leakage), and SIGTERM-graceful shutdown.

**B2 — Ship & operate**
> Deployed a Fastify/Prisma/Postgres API (Render) and a React 19 + Vite SPA (Vercel) via a `render.yaml` blueprint with `/health` checks and migrate-on-deploy; production `npm audit` clean (0 vulnerabilities).

**B3 — CI / quality gates**
> Set up a GitHub Actions pipeline running lint, typecheck, build, tests, and a Docker build on every push, keeping the main branch releasable.

**B4 — Full-stack delivery**
> Delivered an end-to-end slice solo: React 19 SPA (seat grid, optimistic updates, auth panel) ↔ Fastify REST + Socket.io ↔ PostgreSQL via Prisma, deployed live on Render + Vercel.

**B5 — Pragmatic engineering judgment (great talking point, defensible)**
> Diagnosed an over-engineered queue/lock/k8s design as dead code in the running path and simplified booking to a correct, low-latency atomic DB write — documenting the trade-off instead of shipping unused complexity.

### Tier C — only if you've measured it first (currently borderline)

**C1 — Verified concurrency (number is a manual verification, NOT a load test)**
> Verified exactly-one-winner behavior by firing 20 concurrent booking requests at a single seat and observing 1×success / 19×409-conflict locally and against the live demo.
> ⚠️ Defensible only as a *manual verification outcome* (`METRICS_AND_OUTCOMES.md`). It is **not** a load test and not a tracked metric. If asked "at what scale / p95?" you have no answer yet. Prefer A1 unless you can speak to this honestly.

---

## 3. SeatGuard — PLANNED Bullets — DO NOT USE YET

These are designed in `/docs` (`IMMEDIATE_BUILD_PLAN.md`, `FEATURE_PRIORITIZATION.md`, `V2_ARCHITECTURE_PROPOSAL.md`) but **not implemented**. They become usable only after the work ships **and** (where numeric) is measured. Drafts kept here so you can promote them later.

> **PLANNED — DO NOT USE YET — Load-tested correctness**
> "Load-tested the booking engine with k6 at `N` concurrent VUs: 0 oversell, p95 = `X` ms, `Y` req/s."
> Blocked on: rewriting `load-test.js` + running it against staging (F1). Numbers are placeholders.

> **PLANNED — DO NOT USE YET — Integration tests / coverage**
> "Wrote Fastify `inject` + Postgres integration tests covering auth and a concurrency scenario (exactly-one-winner), enforced in CI."
> Blocked on: F2. Today the live API/auth/booking have **0% test coverage**.

> **PLANNED — DO NOT USE YET — Seat holds / idempotency**
> "Built a reserve→confirm flow with TTL-based seat holds and idempotency keys, preventing oversell and double-charge under retries; an expiry reaper releases abandoned holds."
> Blocked on: F3 (schema + routes + reaper). Not in code.

> **PLANNED — DO NOT USE YET — Observability**
> "Exposed Prometheus `/metrics` (latency histogram, `booking_conflicts_total`, `oversell_total`) and OTel traces with SLOs (oversell=0, p95<300ms)."
> Blocked on: F4. `tracing.ts` is opt-in/off; no `/metrics` endpoint exists; the UI telemetry panel is fake.

> **PLANNED — DO NOT USE YET — Distributed scale-out**
> "Scaled real-time fan-out and rate limiting across multiple instances with a Redis Socket.io adapter and shared rate-limit store."
> Blocked on: F5. No Redis is wired in (the old unused `ioredis`/`src/lib/redis-lock.ts` were removed); a Redis adapter would need to be added deliberately first.

> **PLANNED — DO NOT USE YET — Payments**
> "Added Stripe payments on confirm with idempotent webhooks." — Not built (F7).

> **PLANNED — DO NOT USE YET — AI demand-insights**
> "Built a scheduled, read-only LangGraph agent summarizing booking-contention anomalies for organizers."
> Blocked on: F14, explicitly fenced off from the booking path. **No AI exists in the repo today.** Do not use for AI-role applications as if it's done.

---

## 4. Resume-Ready Version A — **3 bullets** (project is one of 2–3 on the page)

Use when SeatGuard is a primary project and you have room for depth. Default = backend/full-stack lens.

> **SeatGuard — Real-time, race-free seat-reservation system** · _TypeScript, Fastify, Prisma, PostgreSQL, Socket.io, React, Render/Vercel_
> - Built a race-free booking engine using a single atomic conditional `UPDATE` (Prisma `updateMany … WHERE status='AVAILABLE'`), guaranteeing exactly one winner per seat under concurrent requests.
> - Implemented stateless JWT auth (bcrypt, token-derived `userId`) gating all mutations, plus Zod validation, per-IP rate limiting, sanitized errors, and graceful shutdown.
> - Deployed the Fastify/Postgres API and React 19 SPA on Render + Vercel behind a GitHub Actions CI pipeline (lint/typecheck/test/build), with a clean production dependency audit.

_Swap bullet 2 or 3 for **A2 (real-time)** or **B5 (pragmatic simplification)** when applying to roles that value those signals._

---

## 5. Resume-Ready Version B — **2 bullets** (3 projects on the page)

Use when projects are the main proof and space is tight — tightest, highest-signal pair.

> **SeatGuard — Real-time, race-free seat-reservation system** · _TypeScript, Fastify, Prisma, PostgreSQL, Socket.io, React_
> - Built a race-free booking engine using an atomic conditional `UPDATE` that guarantees exactly one winner per seat under concurrent requests, with live seat state pushed to all clients over Socket.io.
> - Shipped it end-to-end — JWT auth (bcrypt, token-derived `userId`), Zod validation, rate limiting, and graceful shutdown — deployed on Render + Vercel with a GitHub Actions CI pipeline.

---

## 6. Role-tailored bullet picks (which READY bullets to choose)

| Role | Use these (in order) | Notes |
|---|---|---|
| Backend Engineer | A1, A3, B1 (3-bullet) · A1, A3 (2-bullet) | Lead with concurrency correctness; auth second |
| SDE / Software Dev | A1, A3, B2 | Show build-and-ship breadth |
| Full-stack | A1/A2, A3, B4 | Pull in the React/real-time bullet (B4 or A2) |
| Founding Engineer | A1, B5, B2 | B5 (judgment) reads as senior/founder maturity |
| Platform Engineer | A1, B1, B3 | Operational hygiene: CI, hardening, health |
| AWS/Cloud (SeatGuard as *secondary* only) | B2, B3 | Frame deploy/CI honestly; AWS-specific = different project |
| AI Engineer / AI Security | — | **Do not use SeatGuard.** No AI in repo. |

---

## 7. Maintenance / promotion checklist

When real work lands, move the matching §3 PLANNED bullet into §2 READY and update the version blocks:

- [ ] Live auth build redeployed (then C-tier wording can say "in production") — `PROJECT_STATUS.md` step 1–2.
- [ ] Integration tests merged + `jest --coverage` recorded → promote the tests/coverage bullet.
- [ ] `load-test.js` run against staging → fill `N`, `X ms`, `Y req/s`; promote the load-test bullet; retire C1's caveat.
- [ ] Seat holds + idempotency shipped → promote that bullet.
- [ ] `/metrics` + OTel collector live → promote observability bullet; delete the fake-telemetry caveat.
- [ ] Redis adapter wired → promote scale-out bullet.

> Rule of thumb: a bullet is only allowed to cross from §3 to §2 when you can point a skeptical interviewer at the commit/PR (and, for any number, the benchmark run that produced it).
</content>
</invoke>
