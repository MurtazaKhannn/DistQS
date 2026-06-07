# Distributed Task Processing — Phase 1 + Phase 2 + Phase 3

Phase 1 introduced **Express + BullMQ + Redis** (producer–consumer). Phase 2 adds **PostgreSQL + Prisma** for persistent job tracking, **Zod** validation, **BullMQ retries** with exponential backoff, **Pino** logging, **GET /jobs/:id**, a **task registry**, and **real** email (Brevo HTTPS, Nodemailer SMTP, or PDF (PDFKit) tasks). Phase 3 adds **JWT access tokens** for **`/jobs`**: clients call **`POST /auth/token`** with `Authorization: Bearer <JOB_API_BEARER_TOKEN>` (exchange secret, constant-time compare), receive a short-lived JWT signed with **`JWT_SECRET`**, then send **`Authorization: Bearer <jwt>`** on **`POST /jobs`** and **`GET /jobs/:id`**. In production the API exits on startup if **`JOB_API_BEARER_TOKEN`** or **`JWT_SECRET`** is unset.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- [Docker](https://docs.docker.com/get-docker/) for Redis and PostgreSQL

## Install

```bash
npm install
cp .env.example .env
```

Edit **`.env`**: set `DATABASE_URL`, **`JOB_API_BEARER_TOKEN`**, **`JWT_SECRET`**, and optional Brevo / SMTP / paths.

## Infrastructure (Docker, no Compose)

### Redis (localhost:6379)

```bash
docker run -d --name redis-task-queue -p 6379:6379 redis:7-alpine
```

- **Stop:** `docker stop redis-task-queue`
- **Start:** `docker start redis-task-queue`
- **Remove:** `docker rm -f redis-task-queue`

### PostgreSQL (localhost:5432)

```bash
docker run -d --name postgres-task-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=taskdb -p 5432:5432 postgres:16-alpine
```

Match `DATABASE_URL` in `.env`, for example:

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/taskdb?schema=public"
```

## Database migrations

```bash
npm run db:migrate
```

(`db:generate` runs as part of migrate; for CI use `npm run db:deploy` against migrated databases.)

## Run the stack

Order: **Postgres** → **Redis** → **migrate** → **API** + **worker** (two terminals).

| Process | Command |
|--------|---------|
| API | `npm run dev` |
| Worker | `npm run worker` |

Production-style:

| Process | Command |
|--------|---------|
| API | `npm start` |
| Worker | `npm run start:worker` |

Default API: `http://localhost:3000` (`PORT` overrides).

### Render: worker as a second Web Service (free tier)

Render’s **Background Worker** is paid. To run the consumer on a **free Web Service**, deploy a **second** Web Service from the same repo:

| Setting | Value |
|--------|--------|
| Build | `npm install && npm run db:generate` |
| Start | `npm run start:worker` |
| `PORT` | Do **not** set manually — Render injects it. When `PORT` is set, the worker process also listens on `GET /` and `GET /health` for platform health checks. |

Set the **same** environment variables on this service as you would on a real worker: `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `NODE_ENV=production`, plus `MAIL_FROM`, `PDF_OUTPUT_DIR`, and either **`BREVO_API_KEY`** (recommended on free tier — see below) or **`SMTP_*`** if your plan allows outbound SMTP.

On the **API** Web Service only, set **`JOB_API_BEARER_TOKEN`** (exchange secret) and **`JWT_SECRET`** (signing key), same as locally. The **worker** does not need these — it never exposes the HTTP job routes.

**Email on Render free Web Services**

Render blocks outbound **SMTP** ports (25, 465, 587) on free Web Services. Use **[Brevo](https://www.brevo.com/)** transactional email over **HTTPS** instead (see [Send a transactional email](https://developers.brevo.com/reference/sendtransacemail)):

1. Create a [Brevo](https://app.brevo.com/) account, generate an **API key** (SMTP & API), and [verify a sender](https://help.brevo.com/hc/en-us) (single email or domain).
2. On the worker: set **`BREVO_API_KEY`**, set **`MAIL_FROM`** to a verified Brevo sender (`email@domain.com` or `Name <email@domain.com>`), and **leave `SMTP_HOST` empty** so the app uses the Brevo path.

**Migration from Resend:** remove **`RESEND_API_KEY`** from your environment, add **`BREVO_API_KEY`**, verify **`MAIL_FROM`** in Brevo, and redeploy the worker.

**Caveats**

- This service gets a **public URL**; only plain `ok` is returned on `/` and `/health` (no secrets there).
- **Free Web Services** can **spin down** when idle. The BullMQ worker stops processing until the instance wakes again; jobs stay in **Redis** and are not lost, but completion can be delayed. For always-on processing, use a paid Background Worker or run the worker on an always-on host.

Local dev unchanged: `npm run start:worker` without `PORT` does **not** open the health HTTP server.

## Architecture (Phase 2)

```mermaid
flowchart LR
  Client --> API
  API --> Zod
  API --> JobService
  JobService --> Prisma
  JobService --> BullMQ
  BullMQ --> Redis
  Worker --> Redis
  Worker --> TaskRegistry
  TaskRegistry --> Handlers
  Worker --> Prisma
```

| Path | Role |
|------|------|
| [src/api/app.js](src/api/app.js) | Express app + JSON body parser |
| [src/api/server.js](src/api/server.js) | HTTP listen + graceful shutdown |
| [src/api/routes/auth.js](src/api/routes/auth.js) | `POST /auth/token` (exchange secret for JWT) |
| [src/api/routes/jobs.js](src/api/routes/jobs.js) | `POST /jobs`, `GET /jobs/:id` |
| [src/api/middleware/requireJwtAuth.js](src/api/middleware/requireJwtAuth.js) | JWT verification for `/jobs` routes |
| [src/api/middleware/bearerTokenUtils.js](src/api/middleware/bearerTokenUtils.js) | Parse `Bearer`, timing-safe compare, exchange secret helper |
| [src/api/utils/jwtAccessToken.js](src/api/utils/jwtAccessToken.js) | Sign and verify access JWTs (HS256) |
| [src/queues/taskQueue.js](src/queues/taskQueue.js) | BullMQ `Queue`, Redis connection, **default retries** |
| [src/workers/worker.js](src/workers/worker.js) | BullMQ `Worker`, DB status updates, Pino |
| [src/services/jobService.js](src/services/jobService.js) | DB row + enqueue; enqueue failure handling |
| [src/validators/jobValidators.js](src/validators/jobValidators.js) | Zod schemas |
| [src/tasks/index.js](src/tasks/index.js) | `taskRegistry` lookup |
| [src/tasks/emailTask.js](src/tasks/emailTask.js) | Brevo (HTTPS) or Nodemailer SMTP / jsonTransport |
| [src/tasks/pdfTask.js](src/tasks/pdfTask.js) | PDFKit → `output/` (or `PDF_OUTPUT_DIR`) |
| [src/db/client.js](src/db/client.js) | `PrismaClient` singleton |
| [src/utils/logger.js](src/utils/logger.js) | Pino (+ `pino-pretty` in dev) |

Entrypoints: [src/index.js](src/index.js) (API), [src/worker.js](src/worker.js) → [src/workers/worker.js](src/workers/worker.js).

## End-to-end flow

1. Client → `POST /auth/token` with `Authorization: Bearer <JOB_API_BEARER_TOKEN>` → receives **`access_token`** (JWT).
2. Client → `POST /jobs` with `Authorization: Bearer <access_token>`.
3. API → **Zod** validates `type` + `payload`.
4. **JobService** → insert **`jobs`** row (`queued`).
5. BullMQ `queue.add` → Redis (`task-queue`); row updated with **`queueJobId`**.
6. API responds with **`id`** (database id), **`queueJobId`**, `status: queued`.
7. Worker → job **`active`** in DB; runs **`taskRegistry[job.name]`**.
8. Success → DB `completed` + `completedAt`. Retries → DB `retrying` + `failureReason`; final failure → `failed` + `completedAt`.

BullMQ **defaultJobOptions**: `attempts: 3`, `backoff: { type: "exponential", delay: 2000 }`.

## API

### `POST /auth/token`

Exchange the long-lived **client secret** for a short-lived **JWT** (HS256, signed with **`JWT_SECRET`**).

```http
Authorization: Bearer <JOB_API_BEARER_TOKEN>
```

No JSON body required. **200** response:

```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**401** if the exchange secret is missing, wrong, or malformed `Authorization`. **503** if **`JWT_SECRET`** is not configured on the server.

### `/jobs` routes (JWT)

All **`POST /jobs`** and **`GET /jobs/:id`** requests require:

```http
Authorization: Bearer <access_token>
```

Use the **`access_token`** from **`POST /auth/token`**. The raw **`JOB_API_BEARER_TOKEN`** must **not** be sent on `/jobs` (it will fail JWT verification with **401**).

If the header is missing, malformed, or the JWT is invalid/expired, the API responds with **401** and `{ "success": false, "error": "Unauthorized" }`.

Example (mint token, then enqueue):

```bash
TOKEN=$(curl -sS -X POST "http://localhost:3000/auth/token" \
  -H "Authorization: Bearer $JOB_API_BEARER_TOKEN" | jq -r .access_token)

curl -sS -X POST "http://localhost:3000/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"pdf","payload":{"title":"Demo"}}'
```

### `POST /jobs`

**Email** — requires `to` (email) and `subject`:

```json
{
  "type": "email",
  "payload": {
    "to": "test@gmail.com",
    "subject": "Hello"
  }
}
```

**PDF** — requires `title`; optional `data` (client-supplied JSON for reports, invoices, etc. — the client reads their own DB and sends the payload here):

```json
{
  "type": "pdf",
  "payload": {
    "title": "Monthly report",
    "data": {
      "period": "2026-04",
      "rows": [{ "product": "A", "revenue": 1000 }],
      "total": 1000
    }
  }
}
```

`title` only is still valid (no `data` section in the PDF).

**200 response:**

```json
{
  "success": true,
  "id": "<database-cuid>",
  "jobId": "<same as id>",
  "queueJobId": "<bullmq-job-id>",
  "status": "queued"
}
```

### `GET /jobs/:id`

Same **`Authorization: Bearer <access_token>`** header as `POST /jobs`. Returns `status`, `attempts`, `payload`, `failureReason`, timestamps, `queueJobId`, `type`. **404** if unknown id.

## Environment

See [.env.example](.env.example). Highlights:

- **`JOB_API_BEARER_TOKEN`** — long-lived **exchange secret**. Send only on **`POST /auth/token`** as `Authorization: Bearer <token>` (constant-time compare). **Do not** use this value as the Bearer token on **`/jobs`**.
- **`JWT_SECRET`** — server-only HMAC key used to **sign and verify** access JWTs. Required with the exchange secret for real use. In **`NODE_ENV=production`**, the API **exits** on startup if **`JWT_SECRET`** or **`JOB_API_BEARER_TOKEN`** is missing. Set on the **API** service only (not on the worker).
- **`JWT_EXPIRES_IN`** (optional) — passed to `jsonwebtoken` (e.g. `1h`, `3600`). Defaults to **`1h`** if unset.
- **`DATABASE_URL`** — Postgres connection string (Prisma).
- **`REDIS_HOST`**, **`REDIS_PORT`** — BullMQ (defaults `127.0.0.1` / `6379`).
- **`BREVO_API_KEY`**, **`MAIL_FROM`** — when `BREVO_API_KEY` is set, email is sent via [Brevo’s transactional API](https://developers.brevo.com/reference/sendtransacemail) (HTTPS). **`MAIL_FROM`** must match a sender verified in Brevo. Omit for SMTP or local simulation.
- **`SMTP_*`**, **`MAIL_FROM`** — real SMTP via Nodemailer when **`BREVO_API_KEY`** is unset and **`SMTP_HOST`** is set. If both are unset, Nodemailer uses **`jsonTransport`** (no network mail; good for local demos).
- **`PDF_OUTPUT_DIR`** — where PDFKit writes files (default `./output`).
- **`LOG_LEVEL`**, **`LOG_PRETTY`** — Pino logging.

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `npm start` | API |
| `npm run worker` / `npm run start:worker` | Worker |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:deploy` | Prisma migrate deploy |
| `npm run db:generate` | Prisma generate |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Unit + (optional) integration tests |
| `npm run stress` | Stress script — `POST /auth/token` with **`JOB_API_BEARER_TOKEN`**, then **`POST /jobs`** with returned JWT (`node scripts/stress-enqueue.js [count] [url]`) |

## Tests

- **Unit:** Zod validators (`test/validators.test.js`).
- **Integration:** `RUN_INTEGRATION=1 npm test` — hits real Postgres + Redis; mints JWT via **`POST /auth/token`** then **`POST`/`GET /jobs`**. Ensure **`JOB_API_BEARER_TOKEN`** and **`JWT_SECRET`** are set in `.env` or rely on test defaults.
- **API auth:** `test/apiAuth.test.js` — exchange + JWT + **`/jobs`** without Postgres.

Skip integration: `SKIP_INTEGRATION=1`.

## Debugging (VS Code / Cursor)

**Important:** Breakpoints in **[`src/api/routes/jobs.js`](src/api/routes/jobs.js)** only run in the **API** process (**`src/index.js`** → Express). The **worker** (**`src/worker.js`**) runs BullMQ consumers and **never loads** `jobs.js`. If you start **Debug Worker** (or your terminal shows `node … worker.js`) and send Postman to `/jobs`, breakpoints in `jobs.js` will **never** hit — use **Debug API — Express (jobs.js / Postman)** for that file.

Use **[.vscode/launch.json](.vscode/launch.json)**:

1. **Debug API — Express (jobs.js / Postman)** — use this for `POST /jobs` / `GET /jobs/:id` breakpoints and Postman.
2. **Debug API (nodemon) — Express** — same as above with reload on save.
3. **Debug Worker — BullMQ only (not jobs.js)** — for worker / task handlers under [`src/tasks/`](src/tasks/), not for Express routes.

**Breakpoints on routes:**

- Set a **line breakpoint** (red dot in the gutter). Exception-only breakpoints do not stop on normal HTTP.
- With **Debug API + Worker**, pick the **API** session in the Call Stack dropdown for `jobs.js` breakpoints.
- The `POST` handler runs **after** `requireJwtAuth` — send **`Authorization: Bearer <access_token>`** from **`POST /auth/token`**, or set breakpoints in [`requireJwtAuth.js`](src/api/middleware/requireJwtAuth.js) / [`auth.js`](src/api/routes/auth.js) first.

**`injected env (0) from .env`:** dotenv often logs this when variables were already set (e.g. by launch `envFile`); not necessarily a broken `.env`.

If the process exits with code **1**, check the **integrated terminal** for the first error line.

## Manual error-recovery matrix

| Scenario | What to try |
|----------|-------------|
| Redis down | Start Redis container; re-run API/worker. |
| Postgres down | Start Postgres; `npm run db:migrate`. |
| Invalid body | Expect **400** + Zod `details` from `POST /jobs`. |
| Missing or wrong JWT on `/jobs` | Expect **401** + `Unauthorized` on `POST /jobs` and `GET /jobs/:id`. Mint a new token with **`POST /auth/token`** if expired. |
| Handler always throws | Watch DB **`retrying`** then **`failed`**; BullMQ retries (3×, exponential backoff). |
| Worker killed mid-job | Restart worker; BullMQ **stall** recovery may re-deliver — handlers should be **retry-safe** where side effects matter. |
| Multiple workers | Run two `npm run worker` terminals; jobs distribute across workers (competing consumers). |
| Many jobs | `npm run stress` or `node scripts/stress-enqueue.js 100`. |

## Concepts (Phase 2)

- **Idempotency** — same logical work keyed safely (future: `Idempotency-Key` column).
- **Retry safety** — assume a job may run more than once after failures or duplicates.
- **Observability** — structured **Pino** logs (`event`, `dbJobId`, `queueJobId`, `durationMs`, …).
- **Queue vs DB** — BullMQ/Redis drives **execution**; Postgres is the **durable audit trail** for product APIs.

## Out of scope (later)

Kafka, Kubernetes, microservices, full distributed tracing, Docker Compose in-repo.

## License

ISC (see `package.json`).
