# FUTURE IMPLEMENTATION STRATEGY — TicketBlitz / SeatGuard

Founder + senior-engineer + hiring-manager strategy, grounded in the actual code (`src/index.ts`, `prisma/schema.prisma`, `client/src/App.tsx`, deployment config) and the `/docs` analysis. Brutally honest.

---

## 0. What this project is vs. what it should become

- **Is:** a working, deployed, race-free seat-booking **demo** — Fastify + Prisma + Postgres + Socket.io + JWT, on Render/Vercel. The genuinely hard, genuinely correct part is the atomic claim (`src/index.ts:214` `updateMany({where:{status:'AVAILABLE'}})`).
- **Trying to become:** "a production ticketing app." That framing is **weak** — it competes with Eventbrite/Ticketmaster and the consumer surface (events, payments, organizers) is mostly unbuilt.
- **What's missing to be impressive:** evidence (load-test numbers proving the core claim), tests on the real code (currently 0%), and one piece of real **distributed depth** (seat holds with TTL + idempotency). Plus honesty (the README and the `Visualizer.tsx` telemetry oversell what's real).

---

## 1. Founder lens (brutally honest)

**Real problem solved:** preventing oversell of scarce inventory under high concurrency. Real and valuable — but only acute in *high-contention* contexts (drops, flash sales, limited releases, appointment slots), not generic ticketing.

**Is the current idea strong enough?** As "another ticketing app," **no.** As a **high-contention reservation engine**, **yes** — that's where correctness-under-load is the product, not a checkbox.

**Sharpest positioning (rewrite the value prop):**
> "A reservation engine that guarantees **zero oversell under extreme concurrency**, with real-time inventory updates — the correctness primitive behind flash sales, ticket drops, and appointment booking."

This reframes it from a crowded consumer product into an **infrastructure/platform** story, which is exactly where the existing code is strong.

**Ideal user (first):** developers/teams running **high-contention drops** (event ticket on-sales, limited-edition retail, restaurant/clinic slots) who fear double-selling. Not "everyone running events."

**Pain point to focus on first:** *the moment of contention* — many users, one unit, exactly one winner, instantly reflected everywhere. Everything else is secondary.

**Unnecessary / distracting right now:** multi-tenant org management; payments before holds exist. (The Kafka/Redis dead-code subsystem and the fabricated telemetry panel have already been removed.)

**What makes it different:** most demos show CRUD. This shows **provable concurrency correctness** with a side-by-side **safe vs naive** endpoint (`/api/book-async` vs `/api/book-naive`) — a rare, credible, teachable differentiator.

**What makes someone say "this isn't a student project":** a `load-test` report showing *0 double-bookings at N concurrent VUs with p95 latency X*, integration tests in CI, and a seat-hold→confirm flow with idempotency. Those three turn a demo into an engineering artifact.

**What the MVP must prove:** under heavy concurrency, exactly one user wins each unit, with auth, in real time, **measurably**.

**What it must deliberately NOT do yet:** payments, multi-tenant orgs, Kafka/event-sourcing, mobile, AI features. Resist all of it until holds + tests + metrics exist.

---

## 2. Hiring-manager lens (per role)

| Audience | Strong signals already | Weak signals |
|---|---|---|
| **Backend** | Correct atomic concurrency, JWT done right (token-derived `userId`, `src/index.ts`), Zod validation, rate limiting, graceful shutdown | 0 tests on real paths; single-event assumption (`findFirst({where:{number}})`); single-file app |
| **AI eng** | — | No AI anywhere (fine — don't fake it) |
| **Cloud/Platform** | Live Render+Vercel, `render.yaml`, health checks, CI | Docker never actually built; k8s manifests reference non-existent images; no IaC; no real metrics |
| **Full-stack** | Real-time SPA + optimistic UI + auth; clean gates; 0 prod vulns | Fake telemetry panel; a11y gaps; aspirational README |
| **Founder/senior reviewer** | It's deployed and actually works end-to-end | Misleading README/telemetry erodes trust in everything else |

**What makes it look production-grade:** the atomic claim, auth model, real `/metrics`, CI gates, clean audit.
**What used to make it look like a toy (now fixed):** fabricated metrics, a README claiming Kafka/exactly-once that didn't run, and tests over dead code — all corrected. **Remaining gap:** no tests yet on the live API/auth/booking handlers.

**Resume-bullet-worthy features to build:** load-tested correctness (real numbers), seat-hold saga with TTL + idempotency, real observability (p95/contention/oversell).
**Interview talking points to create:** "how do you prevent double-booking?" (already have the answer), "how do you handle a held seat that's abandoned mid-payment?" (build holds), "how do you prove it's correct?" (build the load test).

**Metrics to generate (none invented):** all currently **Not measured yet** — see `docs/METRICS_AND_OUTCOMES.md` for the benchmark suite (k6 oversell test, p95 latency, 409 contention rate, cold-start).

**Architecture decisions that would impress a senior:** idempotency keys on booking; TTL-based holds with a reaper; shared rate-limit/lock store (Redis) enabling multi-instance; OTel→Prometheus with SLOs; CD with a load-test gate.

---

## 3. Strategy summary (founder value vs engineering value)

| Dimension | Recommendation |
|---|---|
| **Positioning** | High-contention reservation engine, not a ticketing app |
| **Founder value priority** | Holds+payments (sellable), multi-event (real usage) |
| **Engineering value priority** | Load-tested correctness, integration tests, seat-hold saga, observability |
| **Resume value priority** | Provable correctness metrics, idempotency/holds, OTel+Prometheus |
| **MVP** | Auth + race-free book + holds + real-time + measured correctness |
| **Anti-scope** | Kafka/EKS/SageMaker/LangChain until justified (see `docs/TECH_STACK_UPGRADE_ANALYSIS.md`) |

See `docs/IMMEDIATE_BUILD_PLAN.md` for the top-3 step-by-step, `docs/FEATURE_PRIORITIZATION.md` for the ranked list, and `docs/V2_ARCHITECTURE_PROPOSAL.md` for the upgraded design.
