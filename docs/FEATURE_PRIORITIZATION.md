# FEATURE PRIORITIZATION — TicketBlitz / SeatGuard

Scoring model (each sub-score 1–5):
`Priority = User Value + Engineering Depth + Resume Signal + Founder Value − Complexity Risk`
Scores are judgment calls, not measurements. Difficulty/Impact/Resume are Low/Med/High.

---

## Ranked features

| # | Feature | User | Eng | Resume | Founder | Cx Risk | **Score** | Diff | Impact |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| F3 | **Seat holds (reserve→confirm) + TTL + idempotency** | 5 | 5 | 5 | 5 | 3 | **17** | High | High |
| F7 | Payments (Stripe) on confirm, idempotent webhook | 5 | 4 | 4 | 5 | 4 | **14** | High | High |
| F1 | **Load-test harness + defensible correctness metrics** | 2 | 4 | 5 | 4 | 2 | **13** | Low | High |
| F6 | Multi-event support + event CRUD | 4 | 3 | 3 | 5 | 3 | **12** | Med | High |
| F2 | **Integration tests (auth+booking) + export `buildApp`** | 2 | 4 | 4 | 3 | 2 | **11** | Med | High |
| F4 | Real observability: `/metrics` (Prometheus) + OTel collector + Grafana | 2 | 4 | 5 | 3 | 3 | **11** | Med | High |
| F5 | Redis: shared rate-limit store + Socket.io adapter + holds backing | 3 | 4 | 4 | 3 | 3 | **11** | Med | Med |
| F12 | Notifications (email) via Redis-backed queue (BullMQ) | 3 | 4 | 4 | 3 | 3 | **11** | Med | Med |
| F10 | Organizer/admin dashboard + role-based authz | 3 | 3 | 3 | 4 | 3 | **10** | Med | Med |
| F9 | "My bookings" history endpoint + view | 3 | 2 | 2 | 3 | 1 | **9** | Low | Med |
| F14 | AI demand-insights (read-only LLM summary) — optional | 2 | 3 | 4 | 3 | 3 | **9** | Med | Med |
| F8 | CI/CD: auto-deploy + real Docker build + load-test gate | 1 | 3 | 4 | 2 | 2 | **8** | Low | Med |
| F11 | README rewrite + remove/relabel fake telemetry (credibility) | 1 | 1 | 4 | 3 | 1 | **8** | Low | High |
| F13 | httpOnly cookie auth + refresh tokens + revocation | 2 | 3 | 3 | 2 | 3 | **7** | Med | Med |
| F15 | Kafka event-sourcing path (net-new; old dead code removed) | 1 | 4 | 3 | 2 | 5 | **5** | High | Low (now) |
| F16 | DynamoDB single-table high-contention experiment | 1 | 3 | 3 | 1 | 4 | **2** | High | Low |

---

## Buckets

### Must build immediately (highest credibility-per-effort)
- **F2 — Integration tests + `buildApp` export.** Closes the worst gap (0% coverage of live code). Prerequisite for safely shipping everything else.
- **F1 — Load-test + correctness metrics.** Converts the project's central claim ("no double-booking") into evidence. Cheap, huge resume/interview payoff.
- **F3 — Seat holds + idempotency.** The one feature that adds real distributed depth and the best interview story. Slightly higher effort; do it third.
- **F11 — README/telemetry honesty.** Trivial effort, protects credibility of all the above.

### Build after MVP is stable
- **F6** multi-event, **F4** observability, **F5** Redis, **F7** payments, **F12** notifications queue, **F9** my-bookings, **F8** CI/CD.

### Advanced differentiators
- **F10** organizer dashboard, **F13** cookie/refresh auth hardening, **F14** AI demand-insights (only if it earns its place — see `docs/TECH_STACK_UPGRADE_ANALYSIS.md`), and eventually **F15** Kafka *for scale* with real load justification.

### Bad ideas / avoid for now
- **F16 DynamoDB** replacing Postgres (relational model + the conditional-UPDATE pattern fit Postgres; Dynamo would be a forced rewrite — interesting as a *side experiment* only).
- **SageMaker / LangChain / LangGraph / agent orchestration as core** — no AI problem exists here; adding them is resume-padding that a senior reviewer will see through.
- **EKS / Terraform now** — overkill for the MVP; revisit only with the v2 cloud phase.
- **Deploying the dormant Kafka stack for the MVP** — adds ops surface with no current load to justify it.

> Recommended sequence: **F2 → F1 → F11 → F3 → F4 → F5 → F6 → F7**.
