# pod-api

Node/Express/TypeScript/Drizzle backend for the print-on-demand sport fishing & yacht merchandise storefront.

---

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — must be running before any `docker compose` command

---

## Local development setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your Printful API key, S3/R2 credentials, etc. The `DATABASE_URL` is handled automatically when using Docker Compose (see below).

### 3. Start Postgres + Adminer via Docker Desktop

Make sure Docker Desktop is open and running, then:

```bash
docker compose up -d
```

This starts two containers:

- **Postgres 16** on `localhost:5432`
- **Adminer** (DB GUI) on `http://localhost:8080`

**Adminer login:**
| Field | Value |
|----------|------------|
| System | PostgreSQL |
| Server | `db` |
| Username | `postgres` |
| Password | `password` |
| Database | `pod_db` |

### 4. Run database migrations

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/pod_db npm run db:push
```

### 5. Start the API

```bash
npm run dev
```

The server hot-reloads via `nodemon` + `ts-node` and is available at `http://localhost:3001`.

---

## Environment variables

| Variable                | Description                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| `SERVER_PORT`           | Port the API listens on (default `3001`)                                        |
| `PRINTFUL_API_KEY`      | Printful private API key — **server-side only, never sent to the client**       |
| `PRINTFUL_STORE_ID`     | Printful store ID                                                               |
| `DATABASE_URL`          | PostgreSQL connection string                                                    |
| `STRIPE_SECRET_KEY`     | Stripe secret key (`sk_test_…` / `sk_live_…`) from dashboard.stripe.com/apikeys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) — see **Stripe webhooks** below       |
| `AWS_REGION`            | AWS region for S3 (e.g. `us-east-1`)                                            |
| `AWS_ACCESS_KEY_ID`     | AWS / R2 access key                                                             |
| `AWS_SECRET_ACCESS_KEY` | AWS / R2 secret key                                                             |
| `S3_BUCKET_NAME`        | S3 bucket name (public-read ACL required)                                       |
| `CF_ACCOUNT_ID`         | Cloudflare account ID — set this instead of `AWS_REGION` when using R2          |
| `R2_BUCKET_NAME`        | R2 bucket name (alternative to `S3_BUCKET_NAME`)                                |
| `R2_PUBLIC_DOMAIN`      | Public base URL for R2 objects (e.g. `https://assets.yourdomain.com`)           |
| `FRONTEND_URL`          | Allowed CORS origin (no trailing slash)                                         |
| `NODE_ENV`              | `development` or `production`                                                   |

---

## Database commands

```bash
npm run db:push       # push schema directly to DB (dev)
npm run db:generate   # generate a new migration file from schema changes
npm run db:migrate    # apply pending migrations
npm run db:studio     # open Drizzle Studio in the browser
```

---

## Production build

```bash
npm run build   # compiles TypeScript → dist/
npm start       # runs the compiled JS
```

---

## Running alongside the Vite frontend

1. Start Postgres and this API:

   ```bash
   docker compose up -d
   npm run dev
   ```

2. In the frontend repo, set the API base URL in its `.env`:

   ```
   VITE_API_URL=http://localhost:3001
   ```

3. Start the Vite dev server (defaults to port `5173`):
   ```bash
   # in frontend/
   npm run dev
   ```

The API's CORS policy reads `FRONTEND_URL` and allows requests from `http://localhost:5173` by default.

---

## API routes

| Method | Path                     | Description                                                     |
| ------ | ------------------------ | --------------------------------------------------------------- |
| `GET`  | `/api/products`          | All products from Printful v2 (cached 5 min)                    |
| `GET`  | `/api/products/:id`      | Single product with variants                                    |
| `POST` | `/api/checkout`          | Create a Stripe Checkout Session — returns `{ url, sessionId }` |
| `POST` | `/api/upload/logo`       | Upload artwork (`multipart/form-data`, field `file`)            |
| `POST` | `/api/mockups/generate`  | Generate a Printful mockup                                      |
| `POST` | `/api/orders`            | Create a Printful order (rate-limited: 10/min/IP)               |
| `GET`  | `/api/orders/:orderId`   | Fetch normalized order status                                   |
| `POST` | `/api/webhooks/printful` | Receive Printful webhook events                                 |
| `POST` | `/api/webhooks/stripe`   | Receive Stripe webhook events (HMAC-verified)                   |
| `GET`  | `/health`                | Health-check (used by Railway)                                  |

---

## Checkout flow

```
Frontend: POST /api/checkout { items }
  → returns { url, sessionId }
Frontend: redirect user to url (Stripe-hosted page)
  → on success: Stripe redirects to /checkout/success?session_id=…
  → on cancel:  Stripe redirects to /checkout/cancel
Frontend: POST /api/orders { items, shipping } to create the Printful order
Stripe:   POST /api/webhooks/stripe (checkout.session.completed) — logged to webhook_events
```

---

## Stripe webhooks

**Local dev** — use the Stripe CLI to forward events to your local server:

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
# prints whsec_… → set as STRIPE_WEBHOOK_SECRET in .env
```

**Production** — in [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks), add endpoint `https://your-domain.com/api/webhooks/stripe`, select `checkout.session.completed`, then copy the signing secret to `STRIPE_WEBHOOK_SECRET`.

---

---

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway, create a new project → **Deploy from GitHub repo** → select this repo.
3. Add a **Postgres** plugin to the project — Railway injects `DATABASE_URL` automatically.
4. Set all other environment variables from `.env.example` under **Variables**.
5. Railway builds the Docker image using the `Dockerfile` and runs `scripts/start.sh`, which runs migrations then starts the server.
6. Set `FRONTEND_URL` to your deployed frontend URL so CORS is configured correctly.
