# SeatGuard

SeatGuard is a TypeScript backend prototype for experimenting with event seat reservation workflows. It models users, events, seats, and bookings with Prisma/PostgreSQL, exposes a small Fastify API, and includes a separate worker path that consumes booking requests from Kafka-compatible messaging and uses Redis locks around seat processing.

This is not presented as a deployed production system. The repository does not currently include verified production usage, public uptime, load-test results, or real user metrics.

## What The Project Actually Does

From the current source and configuration, SeatGuard includes:

- A Fastify API server in `src/index.ts`.
- A Prisma data model for `User`, `Event`, `Seat`, and `Booking` in `prisma/schema.prisma`.
- PostgreSQL, Redis, and Redpanda services in `docker-compose.yml`.
- A worker in `src/worker.ts` that subscribes to a `booking-requests` topic, uses a Redis lock key per seat, writes bookings through Prisma, and publishes seat updates through Redis pub/sub.
- A direct API booking path intended for a quick demo mode.
- A deliberately naive booking path for demonstrating a race-condition-prone implementation.

## Current API Routes

The routes below are present in `src/index.ts`:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Basic health check with status and timestamp. |
| `POST` | `/api/book-async` | Attempts to book a seat directly through the API demo path. |
| `POST` | `/api/book-naive` | Demonstrates a race-condition-prone read-delay-write booking flow. |
| `GET` | `/api/random-seat` | Returns one available seat for testing. |
| `GET` | `/api/seats` | Returns all seats ordered by ID. |

Note: `src/index.ts` currently contains two `POST /api/book-async` definitions. That should be cleaned up before treating the API server as stable.

## Tech Stack

| Area | Technology |
|---|---|
| Runtime | Node.js, TypeScript |
| API | Fastify, Zod dependency, CORS plugin |
| Database | PostgreSQL, Prisma |
| Locking / pub-sub | Redis, ioredis |
| Messaging | KafkaJS, Redpanda as the local Kafka-compatible broker |
| Realtime | Socket.io dependency and seat-update emit path |
| Observability | OpenTelemetry dependencies and `src/tracing` import |
| Local infrastructure | Docker Compose |

## Architecture

```text
Fastify API (`src/index.ts`)
   |
   +--> Prisma Client --> PostgreSQL
   |
   +--> Socket.io seat update emit path
   |
   +--> Demo booking endpoints

Worker (`src/worker.ts`)
   |
   +--> KafkaJS consumer: booking-requests topic
   |
   +--> Redis lock: lock:seat:<seatNumber>
   |
   +--> Prisma Client --> PostgreSQL
   |
   +--> Redis pub/sub: seat-updates channel

Local infrastructure (`docker-compose.yml`)
   |
   +--> PostgreSQL
   +--> Redis
   +--> Redpanda
```

## Data Model

The Prisma schema defines:

- `User`: unique email, optional name, related bookings.
- `Event`: event name/date/seat count, related seats.
- `Seat`: seat number, row, status, version, related event, optional booking.
- `Booking`: user-seat reservation record with unique `seatId`.

The schema includes `@@unique([eventId, number])` for seats and `seatId @unique` for bookings, which are useful consistency constraints for a reservation system.

## Project Structure

```text
SeatGuard/
|-- src/
|   |-- index.ts          # Fastify API server and demo booking routes
|   |-- worker.ts         # Kafka consumer, Redis lock, Prisma booking worker
|   `-- tracing.ts        # Imported tracing setup, if configured
|-- prisma/
|   `-- schema.prisma     # User, Event, Seat, Booking models
|-- docker-compose.yml    # PostgreSQL, Redis, Redpanda
|-- package.json          # scripts and dependencies
|-- tsconfig.json         # TypeScript compiler config, if present
`-- README.md
```

## Environment Variables

Create a local `.env` file for runtime configuration. Do not commit real secrets.

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ticket_blitz
REDIS_HOST=localhost
REDIS_PORT=6379
KAFKA_BROKERS=localhost:9092
PORT=3000
SINGLE_PROCESS=false
```

The Docker Compose file starts PostgreSQL with these local development defaults:

```env
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=ticket_blitz
```

Use different credentials for any non-local environment.

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

Generate Prisma client and apply migrations if migrations are present:

```bash
npx prisma generate
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

Build TypeScript:

```bash
npm run build
```

## Testing Status

`package.json` currently contains a placeholder test script:

```bash
npm test
```

At the moment, that script exits with "Error: no test specified". Add real tests before relying on the project for correctness.

Suggested tests:

- `POST /api/book-naive` behavior for unavailable seats.
- `POST /api/book-async` success and conflict paths.
- Prisma constraints for one booking per seat.
- Worker Redis lock acquire/release behavior.
- Worker handling of unavailable seats.
- Kafka message parsing and malformed payload handling.

## Current Limitations

- The README does not claim a live deployment because no verified deployment evidence was found.
- The README does not claim production readiness, uptime, traffic, or performance numbers.
- The API file currently has duplicate `POST /api/book-async` route definitions that should be consolidated.
- Kafka is commented out in the API path; Kafka consumption exists in the worker path.
- Redis locking is implemented in the worker path, not in the direct API demo path.
- Automated tests need to be added.
- API documentation should be expanded after the route structure is cleaned up.

## Future Improvements

- Consolidate duplicate booking routes.
- Decide whether booking should happen through the direct API path, the Kafka worker path, or both.
- Add tests for route behavior, database constraints, and worker locking.
- Add seed data and a documented local demo flow.
- Add CI for type-checking, linting, and tests.
- Add reproducible load-test scripts before publishing any performance claims.
- Add deployment documentation only after a real deployment exists.

## License

`package.json` currently declares the project license as `ISC`.
