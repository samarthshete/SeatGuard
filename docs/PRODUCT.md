# PRODUCT — TicketBlitz / SeatGuard

A product lens on the repo. Honest about its current status as a **demo**, with a path to a real product.

---

## Product idea
A reservation system that lets many users compete for limited seats in real time **without ever double-selling a seat**, with instant visual feedback as seats sell out.

## User pain points
- **Buyers:** "I clicked the seat first but someone else got it" / paying for a seat that was already taken (double-booking).
- **Organizers:** overselling → refunds, chargebacks, reputational damage; no live view of inventory selling out.
- **Engineers building this:** concurrency correctness is genuinely hard and easy to get subtly wrong (the repo literally ships a "naive" endpoint to demonstrate the bug).

## User personas
1. **Reviewer / Recruiter "Riya"** (the real current audience) — wants to verify the engineering is correct and the system is live. JTBD: "Show me you can build a correct, deployed, real-time system."
2. **Attendee "Sam"** (future) — wants to grab a specific seat quickly and trust it's really theirs.
3. **Organizer "Omar"** (future) — wants to publish an event, watch it sell, and never oversell.

## User stories
- As a visitor, I can see all seats and which are taken, updated live. *(Done — `GET /api/seats` + Socket.io.)*
- As a user, I can register and log in. *(Done on auth branch — `AuthPanel`, `/api/auth/*`.)*
- As a logged-in user, I can book an available seat and be sure only I get it. *(Done — atomic claim.)*
- As a user, if I try a taken seat, I get a clear "already taken". *(Done — 409.)*
- As an organizer, I can create an event and define seats. *(**Not found in current codebase** — only `prisma/seed.ts` creates events.)*
- As a user, I can hold a seat while I pay. *(**Not found** — no holds/timeouts/payments.)*
- As a user, I can recover my password. *(**Not found**.)*

## Jobs-to-be-done
- "When demand spikes for a scarce seat, help me claim exactly one and never let two people win." *(Core JTBD — satisfied.)*
- "When I'm evaluating this engineer's work, let me see it working live and verify correctness." *(Satisfied.)*
- "When I run an event, help me manage inventory and sell it safely." *(Not yet — needs event CRUD, holds, payments.)*

## MVP features
| Feature | Status | Evidence |
|---|---|---|
| Seat grid (live) | ✅ | `client/src/App.tsx`, Socket.io |
| Auth (register/login) | ✅ (branch) | `AuthPanel.tsx`, `src/index.ts` |
| Race-free booking | ✅ | atomic `updateMany` in `src/index.ts` |
| Conflict handling (409) | ✅ | `src/index.ts` |
| Input validation | ✅ | Zod schemas |
| Health/observability | ⚠️ partial | `/health` real; telemetry panel fake |

## Feature priority (next)
1. **P0** — Redeploy the auth build; de-risk the exposed DB credential.
2. **P0** — Add automated tests for the **live** booking + auth paths (currently zero).
3. **P1** — Multi-event support (event-scoped seat lookup).
4. **P1** — Seat holds with expiry (reserve → confirm) — prerequisite for payments.
5. **P2** — Payments (Stripe) + booking confirmation emails.
6. **P2** — Organizer event CRUD + admin view.
7. **P3** — Real metrics/observability replacing the cosmetic panel.

## Product workflows
- **Browse → (auth) → book → live-confirm.** Fully working on the auth branch.
- **Organizer publish event → define seats → monitor sales.** Not built.
- **Reserve → pay → confirm.** Not built (today it's instant book, no payment).

## Success metrics
See `docs/METRICS_AND_OUTCOMES.md`. None are currently measured. The headline defensible metric to generate: **zero double-bookings under N concurrent requests** (the repo's `load-test.js` + the conditional-update proof).

## Product risks
- **Identity confusion** — two names (TicketBlitz/SeatGuard) hurt positioning.
- **Trust gap** — *(addressed)* the README and the telemetry panel previously oversold what's real; both have been corrected to match the code.
- **Scope creep** — adding broker/queue/k8s complexity the product doesn't need yet (the old dead Kafka/Redis stack has been removed; don't re-add without a load reason).
- **No payments/holds** — without them it's a booking *demo*, not a sellable product.

## Differentiation from existing products
- vs Eventbrite/Ticketmaster: not competitive as a product; this is an **engineering reference implementation** of correct concurrency + real-time UI.
- Differentiators if productized: transparent, race-condition-correct booking; live "sold-out" visualization; lightweight self-hostable stack (Fastify + Postgres + Socket.io) without heavyweight infra.
- The unique demo asset is the side-by-side **safe vs naive** booking (`/api/book-async` vs `/api/book-naive`) — a teaching/credibility feature few products expose.
