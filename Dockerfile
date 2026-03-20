# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY drizzle.config.ts ./

RUN npm run build

# ── Production image ───────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
# Copy migrations so drizzle-kit migrate can run at startup
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY scripts/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 3001

CMD ["./start.sh"]
