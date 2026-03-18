# pod-api

Node/Express/TypeScript backend for the print-on-demand sport fishing & yacht merchandise storefront.

---

## Install

```bash
cd pod-api
npm install
```

---

## Environment variables

Copy the example file and fill in your secrets:

```bash
cp .env.example .env
```

| Variable                | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `SERVER_PORT`           | Port the API listens on (default `3001`)                                  |
| `PRINTFUL_API_KEY`      | Printful private API key — **server-side only, never sent to the client** |
| `PRINTFUL_STORE_ID`     | Printful store ID                                                         |
| `AWS_REGION`            | AWS region for S3 (e.g. `us-east-1`)                                      |
| `AWS_ACCESS_KEY_ID`     | AWS / R2 access key                                                       |
| `AWS_SECRET_ACCESS_KEY` | AWS / R2 secret key                                                       |
| `S3_BUCKET_NAME`        | S3 bucket name (public-read ACL required)                                 |
| `CF_ACCOUNT_ID`         | Cloudflare account ID — set this instead of `AWS_REGION` when using R2    |
| `R2_BUCKET_NAME`        | R2 bucket name (alternative to `S3_BUCKET_NAME`)                          |
| `R2_PUBLIC_DOMAIN`      | Public base URL for R2 objects (e.g. `https://assets.yourdomain.com`)     |
| `FRONTEND_URL`          | Allowed CORS origin (no trailing slash)                                   |
| `NODE_ENV`              | `development` or `production`                                             |

---

## Dev start

```bash
npm run dev
```

The server hot-reloads via `nodemon` + `ts-node`. It will be available at `http://localhost:3001`.

---

## Production build

```bash
npm run build   # compiles TypeScript → dist/
npm start       # runs the compiled JS
```

---

## Running alongside the Vite frontend

1. Start this API first:

   ```bash
   # in pod-api/
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

The API's CORS policy reads `FRONTEND_URL` and will allow requests from `http://localhost:5173` by default.

---

## API routes

| Method | Path                     | Description                                          |
| ------ | ------------------------ | ---------------------------------------------------- |
| `GET`  | `/api/products`          | All products from Printful (cached 5 min)            |
| `GET`  | `/api/products/:id`      | Single product with variants                         |
| `POST` | `/api/upload/logo`       | Upload artwork (`multipart/form-data`, field `file`) |
| `POST` | `/api/mockups/generate`  | Generate a Printful mockup                           |
| `POST` | `/api/orders`            | Create an order (rate-limited: 10/min/IP)            |
| `GET`  | `/api/orders/:orderId`   | Fetch normalized order status                        |
| `POST` | `/api/webhooks/printful` | Receive Printful webhook events                      |
| `GET`  | `/health`                | Health-check (used by Railway)                       |

---

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway, create a new project → **Deploy from GitHub repo** → select this repo.
3. Set all environment variables from `.env.example` in the Railway dashboard under **Variables**.
4. Railway will auto-detect `npm start` from `package.json` and run the compiled build.
5. Set `FRONTEND_URL` to your deployed frontend URL so CORS is configured correctly.
