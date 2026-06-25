# TECH STACK UPGRADE ANALYSIS — TicketBlitz / SeatGuard

Honest per-technology fit. The project is a **relational, real-time reservation engine** with **no AI workload**. Recommendations follow from that, not from hype.

---

## LangChain
- **Should we add it?** No
- **Fit score:** 2/10
- **Where it fits:** Only if you add an LLM feature (e.g. natural-language event search or a support bot).
- **Where it does NOT fit:** The entire current system — booking, auth, real-time — is deterministic. There is no retrieval/tooling/LLM chain to abstract.
- **Feature it enables:** NL search / chatbot (not core).
- **Architecture change:** Add an LLM provider + a chain service; new route.
- **Difficulty:** Medium · **Resume/interview value:** Medium (only if genuinely used) · **Risk of looking forced:** High
- **Final:** Skip unless a real LLM feature is committed to. Don't wrap deterministic booking logic in a chain.

## LangGraph
- **Should we add it?** Maybe (later, niche)
- **Fit score:** 3/10
- **Where it fits:** A genuine multi-step agentic workflow — e.g. a "demand/ops agent" that: pulls booking stats → detects anomalies (sudden sellout) → drafts an organizer alert → optionally proposes price/capacity changes. **Graph nodes:** `fetchMetrics → analyzeContention → summarize → (human-approval) → notify`. That's a legitimate graph.
- **Where it does NOT fit:** The booking critical path (must be deterministic, low-latency, transactional — never an agent).
- **Feature it enables:** F14 demand-insights as an agent.
- **Architecture change:** Separate async worker invoking the graph on a schedule; never inline with requests.
- **Difficulty:** High · **Resume value:** High (if real) · **Risk of looking forced:** High
- **Final:** Only as an isolated, optional Phase 4 feature. Keep it out of the reservation path.

## Agent orchestration (general)
- **Should we add it?** No
- **Fit score:** 2/10
- **Reason:** Nothing here is agentic. Orchestration without a real multi-agent task is pure decoration.
- **Final:** Skip.

## Amazon EKS
- **Should we add it?** Maybe (production-grade showcase, not MVP)
- **Fit score:** 4/10
- **Where it fits:** A "production-grade deployment" narrative for a cloud/platform role; the repo already has `k8s/{deployment,service,hpa}.yaml` aimed at this.
- **Where it does NOT fit:** The MVP — Render runs it fine; a single API + SPA does not need Kubernetes.
- **Feature it enables:** HPA autoscaling, multi-instance (needs Redis Socket.io adapter first).
- **Architecture change:** Real Docker image → registry → EKS + managed Postgres/Redis; the manifests need real images and a registry.
- **Difficulty:** High · **Resume value:** High (cloud roles) · **Risk of looking forced:** Medium (overkill if features are thin)
- **Final:** Defer to v2 cloud phase; document it as the scaling target. Don't deploy EKS for a 100-seat demo.

## AWS Lambda
- **Should we add it?** Maybe (narrow)
- **Fit score:** 5/10
- **Where it fits:** The **seat-hold expiry reaper** (scheduled Lambda releasing expired holds) or async side-effects (emails). A clean serverless use.
- **Where it does NOT fit:** The stateful WebSocket server (Socket.io needs a persistent connection; Lambda is awkward here — would require API Gateway WebSockets, a rewrite).
- **Feature it enables:** hold-expiry job, notification fan-out.
- **Architecture change:** Extract a job; trigger via EventBridge schedule.
- **Difficulty:** Medium · **Resume value:** Medium · **Risk of looking forced:** Medium
- **Final:** A background interval/cron or BullMQ job is simpler for the MVP. Use Lambda only if you're deliberately building an AWS-serverless story.

## Amazon DynamoDB
- **Should we add it?** No (Maybe as a side experiment)
- **Fit score:** 4/10
- **Where it fits (honestly):** The atomic seat claim maps *beautifully* to a DynamoDB **conditional write** (`ConditionExpression: status = AVAILABLE`) — a legit single-item high-contention pattern and a good talking point.
- **Where it does NOT fit:** Everything else is relational — `User/Event/Seat/Booking` with FKs, joins, "seats per event", "bookings per user". DynamoDB would force single-table modeling and lose Prisma's ergonomics for marginal benefit.
- **Feature it enables:** an alternative claim backend (experiment only).
- **Architecture change:** Replace the seat store; rework all queries — large.
- **Difficulty:** High · **Resume value:** Medium · **Risk of looking forced:** Medium-High
- **Final:** Keep Postgres. Optionally write a **small standalone experiment** doc/branch showing the Dynamo conditional-write equivalent — that gets the talking point without a rewrite.

## Amazon SageMaker
- **Should we add it?** No
- **Fit score:** 1/10
- **Reason:** No model training/hosting need. Even the optional AI feature (F14) would call an external LLM API, not train a model.
- **Final:** Skip entirely.

## Redis
- **Should we add it?** **Yes**
- **Fit score:** 8/10
- **Where it fits:** (1) **Shared rate-limit store** so `@fastify/rate-limit` works across multiple instances; (2) **Socket.io Redis adapter** for multi-instance real-time fan-out; (3) **seat-hold TTL** backing (`SETEX`/Redlock — would need to be built; the old unused Redlock impl was removed); (4) cache for `GET /api/seats`.
- **Where it does NOT fit:** As the source of truth for bookings (Postgres stays authoritative).
- **Feature it enables:** F3 holds, F5 multi-instance, F4 perf.
- **Architecture change:** Add a managed Redis (Upstash/Render); wire the existing `ioredis`.
- **Difficulty:** Medium · **Resume value:** Medium-High · **Risk of looking forced:** Low
- **Final:** Add deliberately when you build holds/multi-instance — as new, wired, tested code (the old dead Redis code was removed).

## Kafka / queue system
- **Should we add it?** Maybe (queue yes-eventually, Kafka no-now)
- **Fit score:** 5/10
- **Where it fits:** A **lightweight queue (BullMQ on Redis)** for async side-effects (emails, analytics) is justified soon. **Kafka** fits only at real scale (spike absorption, event sourcing, multiple consumer groups) — it would be net-new (the old unwired `worker.ts`/`kafka-utils.ts` were removed).
- **Where it does NOT fit:** The MVP booking path — it's already correct and fast without a broker. Kafka now = ops overhead with no load to justify it.
- **Feature it enables:** notifications (queue), analytics/event-sourcing (Kafka, later).
- **Architecture change:** Queue = add Redis + BullMQ worker. Kafka = managed broker + consumers + DLQ.
- **Difficulty:** Med (BullMQ) / High (Kafka) · **Resume value:** Med/High · **Risk of looking forced:** Low (BullMQ) / High (Kafka now)
- **Final:** Use BullMQ for notifications post-MVP. Only add Kafka with a documented load reason (the old dead Kafka code was already deleted — `docs/DECISIONS.md` D2).

## S3 / Cloudflare R2
- **Should we add it?** Maybe (low priority)
- **Fit score:** 4/10
- **Where it fits:** Storing event images or generated ticket PDFs once events/payments exist.
- **Where it does NOT fit:** Nothing today stores blobs.
- **Final:** Add only when events have media or tickets become downloadable artifacts.

## OpenTelemetry
- **Should we add it?** **Yes (turn on what exists)**
- **Fit score:** 8/10
- **Where it fits:** `src/tracing.ts` already wires OTel (opt-in via `ENABLE_TRACING`). Point it at a collector to get real traces (request lifecycle, DB spans).
- **Where it does NOT fit:** Nowhere problematic; just keep it opt-in.
- **Feature it enables:** F4 observability, defensible latency metrics.
- **Architecture change:** Add a collector (Grafana Tempo/Jaeger) + set `OTEL_EXPORTER_OTLP_ENDPOINT`.
- **Difficulty:** Low-Med · **Resume value:** High · **Risk of looking forced:** Low
- **Final:** Yes — it's half-built; finishing it is high ROI.

## Prometheus / Grafana
- **Should we add it?** **Yes**
- **Fit score:** 8/10
- **Where it fits:** A `/metrics` endpoint exposing request counts, latency histograms, **409 contention rate**, and **oversell counter (target: 0)** — directly proves the product thesis. `k8s/deployment.yaml` already has Prometheus scrape annotations but **no metrics endpoint exists** to back them.
- **Feature it enables:** F4; the headline correctness dashboard.
- **Architecture change:** Add `prom-client` + `/metrics`; Grafana dashboards.
- **Difficulty:** Medium · **Resume value:** High · **Risk of looking forced:** Low
- **Final:** Yes — this is the metric story that makes the project defensible.

## Terraform
- **Should we add it?** Maybe (with the cloud phase)
- **Fit score:** 5/10
- **Where it fits:** IaC for a real cloud target (EKS + RDS + ElastiCache) — strong for platform roles.
- **Where it does NOT fit:** Render/Vercel are dashboard/Blueprint-managed; Terraform adds little for them.
- **Difficulty:** Medium · **Resume value:** Med-High (platform) · **Risk of looking forced:** Medium
- **Final:** Add only alongside an EKS/AWS move; don't IaC a Render demo.

## GitHub Actions CI/CD
- **Should we add it?** **Yes (extend what exists)**
- **Fit score:** 9/10
- **Where it fits:** `.github/workflows/ci.yml` already lints/typechecks/builds/tests/docker-builds. Extend with **CD** (auto-deploy on `main`), make the **Docker build actually run** (it never has locally), and add a **load-test gate** (F1).
- **Where it does NOT fit:** N/A.
- **Difficulty:** Low · **Resume value:** Med-High · **Risk of looking forced:** Low
- **Final:** Yes — cheapest credibility win after tests.

---

## One-line verdicts
**Add now/soon:** Redis, OpenTelemetry, Prometheus/Grafana, GitHub Actions CD, BullMQ (queue).
**Defer (justified later):** EKS, Terraform, Lambda, Kafka, S3/R2.
**Avoid (forced for this project):** SageMaker, LangChain/LangGraph/agent-orchestration as core, DynamoDB as the primary store.
