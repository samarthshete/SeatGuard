# SeatGuard

SeatGuard is a TypeScript backend prototype for event seat reservation workflows. It focuses on the core consistency problem in booking systems: preventing conflicting reservations while coordinating database writes, Redis locks, and Kafka-compatible event messages.

This README intentionally describes the repository as a prototype based on the visible code and configuration. Public deployment, load-test metrics, production uptime, and real user traffic are not claimed here.

## Problem Solved

Seat booking systems need to handle multiple users attempting to reserve the same inventory. SeatGuard explores backend patterns for that problem:

- A PostgreSQL-backed reservation data model.
- Redis-backed lock and cache infrastructure.
- Kafka-compatible messaging through Redpanda for event-driven workflows.
- TypeScript service code with runtime validation.
- Docker Compose infrastructure for local development.

## Key Features

- Node.js/TypeScript backend.
- Fastify HTTP server dependencies.
- Prisma client and migrations support.
- Redis dependency for lock-oriented reservation flow design.
- KafkaJS dependency for event publishing/consuming patterns.
- Redpanda container in Docker Compose as the local Kafka-compatible broker.
- PostgreSQL and Redis containers for local infrastructure.
- OpenTelemetry dependencies for future distributed tracing support.

## Tech Stack

| Area | Technology |
|---|---|
| Runtime | Node.js, TypeScript |
| API | Fastify, Zod |
| Database | PostgreSQL, Prisma |
| Cache / locking | Redis, ioredis |
| Messaging | KafkaJS, Redpanda |
| Realtime / sockets | Socket.io dependency present |
| Observability | OpenTelemetry dependencies present |
| DevOps | Docker Compose |

## Architecture

```text
Client / API caller
   |
   v
Fastify API service
   |
   +--> Redis for reservation locks / temporary state
   |
   +--> PostgreSQL through Prisma for durable booking data
   |
   +--> Redpanda/Kafka topic for booking-related events
   |
   +--> Worker process for asynchronous event handling
```

The repository scripts expose separate API and worker entry points:

```json
"dev:api": "ts-node src/index.ts",
"dev:worker": "ts-node src/worker.ts",
"start:api": "npx prisma migrate deploy && node dist/index.js",
"start:worker": "node dist/worker.js"
```

## Project Structure

Exact source layout may evolve, but the repository configuration points to this backend-centered structure:

```text
SeatGuard/
|-- src/                     # TypeScript API and worker source
|-- prisma/                  # Prisma schema and migrations, if present
|-- docker-compose.yml       # PostgreSQL, Redis, Redpanda
|-- package.json             # scripts and dependencies
|-- tsconfig.json            # TypeScript compiler config, if present
`-- README.md
```

## Environment Variables

Create a local `.env` file for runtime configuration. Do not commit real secrets.

Example placeholders:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ticket_blitz
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
PORT=3000
NODE_ENV=development
```

## Run Locally

Prerequisites:

- Node.js 20+
- Docker and Docker Compose

Install dependencies:

```bash
npm install
```

Start local infrastructure:

```bash
docker compose up -d
```

Apply database migrations if Prisma schema/migrations are present:

```bash
npx prisma migrate deploy
```

Run the API:

```bash
npm run dev:api
```

Run the worker in a second terminal:

```bash
npm run dev:worker
```

## Testing

`package.json` currently contains a placeholder `test` script. Add real unit/integration tests before treating this as a production-ready booking system.

Suggested test coverage:

- Reservation lock acquire/release behavior.
- Duplicate reservation attempts for the same seat.
- Database transaction rollback paths.
- Event publishing and worker idempotency.
- API validation failures.

## Technical Decisions

- Use Redis as a fast coordination layer for seat-level locks.
- Use PostgreSQL as the durable source of truth for reservations.
- Use Redpanda locally to develop Kafka-compatible event flows without requiring an external Kafka cluster.
- Keep API and worker processes separate so synchronous booking work and asynchronous event handling can evolve independently.

## Current Limitations

- No verified public live demo is documented.
- No verified production/load/user metrics are included.
- The test script is currently a placeholder.
- Deployment manifests and monitoring dashboards should be added before production use.

## Future Goals

- Add real automated tests for concurrency and reservation conflicts.
- Add API documentation for reservation endpoints.
- Add load-test scripts and publish only reproducible results.
- Add CI for linting, type-checking, tests, and migration checks.
- Add observability dashboards once instrumentation is wired end to end.

## License

The repository currently declares `ISC` in `package.json` unless a separate license file is added.
