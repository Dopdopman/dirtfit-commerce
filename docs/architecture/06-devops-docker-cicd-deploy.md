# 06. DevOps, Docker, CI/CD & Free Deployment Blueprint ($0/Month)

> **Goal:** Production-grade packaging (non-root multi-stage Docker containers, 1-command local dev stack, security-hardened CI/CD with safe migrations) running at **\$0/month** on Free Tier infrastructure, with explicit mitigations for every platform limit.

---

## 1. Containerization (Multi-Stage Non-Root Dockerfiles)

Both Dockerfiles (`apps/api/Dockerfile` and `apps/web/Dockerfile`) build from the **Monorepo root context** (`docker build -f apps/api/Dockerfile .`) using `turbo prune` so workspace packages (`@dirtfit/ergonomics-engine`, `@dirtfit/shared`) bundle cleanly.

### 1.1. `apps/api/Dockerfile` Blueprint (Node 22 Alpine, Non-Root, ~140 MB)

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- Stage 1: Prune monorepo for @dirtfit/api ----
FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
COPY . .
RUN npx turbo@2 prune @dirtfit/api --docker

# ---- Stage 2: Install dependencies & generate Prisma Client ----
FROM node:22-alpine AS installer
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --prod=false

COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @dirtfit/api exec prisma generate
RUN pnpm prune --prod

# ---- Stage 3: Production Runtime (Non-Root, Tini, Healthcheck) ----
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl tini wget \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 dirtfit

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY --from=installer --chown=dirtfit:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=dirtfit:nodejs /app/packages ./packages
COPY --from=installer --chown=dirtfit:nodejs /app/apps/api ./apps/api

USER dirtfit
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/src/server.js"]
```

### 1.2. `apps/web/Dockerfile` Blueprint (Next.js Standalone Output, Non-Root)

`apps/web/next.config.mjs` enables `output: 'standalone'` and `transpilePackages: ['@dirtfit/ergonomics-engine', '@dirtfit/shared']`.

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS pruner
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app
COPY . .
RUN npx turbo@2 prune @dirtfit/web --docker

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CDN_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_CDN_URL=${NEXT_PUBLIC_CDN_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @dirtfit/web build

FROM node:22-alpine AS runner
RUN apk add --no-cache tini wget \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
```

---

## 2. Local Development Stack (`docker-compose.yml`)

In **Phase 0**, `docker-compose.yml` provisions core infrastructure (`postgres` 16, `redis` 7, and optional `adminer` under `--profile tools`) so `apps/api` and `apps/web` run natively via `pnpm dev` with maximum hot-reload speed. In **Phase 8**, optional `api` and `web` container services can be added for full-stack container parity.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: dirtfit-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: dirtfit
      POSTGRES_PASSWORD: dirtfit_local_dev_password
      POSTGRES_DB: dirtfit_db
    ports:
      - '5432:5432'
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dirtfit -d dirtfit_db']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: dirtfit-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 128mb --maxmemory-policy allkeys-lru
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

  adminer:
    image: adminer:4
    container_name: dirtfit-adminer
    profiles: ['tools']
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - '8080:8080'

volumes:
  pg_data:
  redis_data:
```

---

## 3. CI/CD Pipelines (GitHub Actions)

### 3.1. Pull Request Verification (`.github/workflows/pr-check.yml`)

Triggered on every `pull_request` to `main` and feature branch pushes:

```mermaid
flowchart LR
    A["Checkout + pnpm install\n(cached)"] --> B["Pure-JS + Lint + Format\n(check:pure-js, ESLint, Prettier)"]
    A --> C["Prisma Validate\n(Schema check)"]
    A --> D["Unit Tests\n(ergonomics-engine + shared)"]
    C --> E["API Integration Tests\n(Postgres 16 + Redis 7 services)"]
    B & D & E --> F["Docker Build Check\n(apps/api & apps/web)"]
    F --> G["Security Scan\n(pnpm audit + Trivy FS/Image)"]
```

- **Job 1 (`lint-and-validate`)**: Runs `pnpm check:pure-js` (guarantees zero `.ts`, `.tsx`, `tsconfig.json`, or `typescript`), `pnpm lint`, `pnpm format:check`, and `prisma validate`.
- **Job 2 (`unit-and-integration-tests`)**: Spins up `postgres:16-alpine` and `redis:7-alpine` service containers, applies `prisma migrate deploy`, and runs `pnpm test:coverage` (including Fastify `app.inject()` concurrency locking & reuse-detection tests).
- **Job 3 (`docker-and-security-scan`)**: Runs `docker/build-push-action` (`push: false`, `type=gha` cache), `pnpm audit --prod --audit-level=high`, and `aquasecurity/trivy-action` (fails on unpatched `CRITICAL` CVEs).

### 3.2. Production Deployment (`.github/workflows/deploy-prod.yml`)

Triggered on merge to `main`:
1. **Safety Gate:** Re-runs full test suite and Prisma validation.
2. **Safe DB Migration:** Runs `prisma migrate deploy` via `DIRECT_URL` using **Expand-and-Contract** backward-compatible migrations.
3. **Backend Deploy (`apps/api`)**: Triggers Render Deploy Hook / Koyeb CLI and polls `GET /health/ready` until `200 OK` (120s timeout).
4. **Frontend Deploy (`apps/web`)**: Deploys to Vercel after API readiness passes so new frontend code never hits missing API endpoints.
5. **Post-Deploy Smoke Test:** Verifies `/health/ready`, `GET /api/v1/bikes`, and `/` return HTTP `200`.

### 3.3. Scheduled Maintenance Sweeper (`.github/workflows/cron-sweeper.yml`)
- Runs every 15 minutes (`schedule: "*/15 * * * *"`) invoking HMAC-signed `POST https://api.dirtfit.vn/internal/cron/expire-reservations` to clean up expired `InventoryReservation`, `RefreshToken`, and `IdempotencyKey` rows — consuming **zero Upstash Redis commands**.
- **Important:** Because free-tier GitHub Actions crons can be delayed, **Lazy Expiration** during availability reads and Checkout transactions remains the primary mechanism guaranteeing instant stock reclamation.

---

## 4. Environment Variable Templates (`.env.example`)

### 4.1. `apps/api/.env.example`
```dotenv
# Runtime
NODE_ENV=development
PORT=4000
HOST=0.0.0.0
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
LOG_LEVEL=info

# Database (Neon: DATABASE_URL uses ?pgbouncer=true&connection_limit=5, DIRECT_URL is non-pooled)
DATABASE_URL=postgresql://dirtfit:dirtfit_local_dev_password@localhost:5432/dirtfit_db
DIRECT_URL=postgresql://dirtfit:dirtfit_local_dev_password@localhost:5432/dirtfit_db

# Redis (Local Docker or Upstash rediss://...)
REDIS_URL=redis://localhost:6379

# Security & Auth (Generate via: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_ACCESS_SECRET=replace-with-64-byte-hex-secret
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=14
COOKIE_SECRET=replace-with-32-byte-hex-secret
CORS_ALLOWED_ORIGINS=http://localhost:3000
CRON_HMAC_SECRET=replace-with-32-byte-hex-secret

# Cloudflare R2 (S3-compatible Storage)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=dirtfit-media
R2_PUBLIC_BASE_URL=https://cdn.dirtfit.vn

# Payment Gateways (Local/Test/CI uses MOCK; Production uses PAYOS)
PAYMENT_DEFAULT_PROVIDER=MOCK
ENABLE_MOCK_PAYMENT=true
MOCK_PAYMENT_WEBHOOK_SECRET=replace-with-local-mock-secret
PAYOS_CLIENT_ID=your-payos-client-id
PAYOS_API_KEY=your-payos-api-key
PAYOS_CHECKSUM_KEY=your-payos-checksum-key
VNPAY_TMN_CODE=your-vnpay-tmn-code
VNPAY_HASH_SECRET=your-vnpay-hash-secret
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me

# Transactional Email (Resend)
RESEND_API_KEY=re_replace_me
EMAIL_FROM="DirtFit Commerce <noreply@dirtfit.vn>"
```

### 4.2. `apps/web/.env.example`
```dotenv
# Public variables (URL only, NEVER place secrets here)
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_CDN_URL=https://cdn.dirtfit.vn
NEXT_PUBLIC_APP_NAME=DirtFit Commerce

# Server-only internal URL for SSR inside Docker / Vercel
INTERNAL_API_URL=http://localhost:4000
```

---

## 5. \$0/Month Free Tier Deployment Blueprint — Limits & Mitigations

| Component | Provider (\$0/mo) | Real Free Tier Limits | Mandatory Engineering Mitigations |
| :--- | :--- | :--- | :--- |
| **Web Frontend** (`apps/web`) | **Vercel Hobby** | 100 GB bandwidth/mo; `10s` function timeout; 100k invocations. | 1. Next.js ISR (`revalidate: 60s`) serves Catalog & Bike Detail from Edge CDN.<br>2. `@dirtfit/ergonomics-engine` runs in-browser (0 serverless invocations during simulator interaction). |
| **API Backend** (`apps/api`) | **Render Free Web Service** *(or **Koyeb Free**)* | **512 MB RAM**, 0.1–0.5 vCPU. Render spins down after **15 min idle** (`30–50s` cold start). | 1. **Pure JS Fastify** uses ~70–95 MB RAM (2–3x leaner than NestJS), avoiding OOM kills.<br>2. **Zero large file buffering in API RAM:** direct browser-to-R2 Presigned PUT.<br>3. `api-client.js` retries with exponential backoff and a friendly cold-start banner.<br>4. Koyeb Free Nano can be used if faster cold-start latency is preferred. |
| **PostgreSQL** | **Neon Free Tier** *(fallback: Supabase Free)* | **0.5 GB storage**, 190 compute hours/mo, auto-suspends after **5 min idle** (~500ms wake-up). | 1. Separate `DATABASE_URL` (**PgBouncer pooled** `?pgbouncer=true&connection_limit=5&pool_timeout=20`) from `DIRECT_URL` (migrations).<br>2. Media stored in R2 (DB stores URLs & JSON → 0.5 GB holds >50k orders).<br>3. Lightweight connection retry on Neon wake-up. |
| **Redis** | **Upstash Redis Free** | **500,000 commands/mo** (~16,600/day), 256 MB max. | 1. **NO BullMQ/worker polling on Upstash** (would exhaust quota in 2 days). Uses inline **Lazy Expiration** + 15-min GitHub Actions cron sweeper.<br>2. **L1 In-Memory LRU Cache (30s)** in Fastify ahead of Upstash L2 Cache cuts Redis reads by >80%.<br>3. Rate limit Redis store applied only to sensitive endpoints (`/auth/*`, `/orders`, `/test-rides`, `/uploads/*`), never `/health/live`. |
| **Media & Blueprints** | **Cloudflare R2 Free** | **10 GB storage**, 1M Class A writes, 10M Class B reads/mo, **Zero Egress fees**. | 1. Eliminates bandwidth lockouts common on Cloudinary Free.<br>2. WebP/AVIF compression + `Cache-Control: public, max-age=31536000, immutable`.<br>3. Magic Bytes checked via `Range: bytes=0-4095` (4KB only). |
| **Transactional Email** | **Resend Free** | 3,000 emails/mo, **100 emails/day**. | Restricted strictly to high-value transactional emails (verification, password reset, deposit/order confirmation, test ride booking). |

> **Cross-Origin Cookie Note (Vercel + Render/Koyeb):**  
> To avoid third-party cookie blocking in Safari/Chrome for `HttpOnly` Refresh Cookies, bind subdomains under one root domain (`dirtfit.vn` → Vercel, `api.dirtfit.vn` → Render/Koyeb, `cdn.dirtfit.vn` → R2) with `SameSite=Lax; Domain=.dirtfit.vn; Secure; HttpOnly`. If deployed temporarily on separate domains (`*.vercel.app` and `*.onrender.com`), configure `SameSite=None; Secure; HttpOnly` paired with strict CSRF `Origin`/`Referer` verification on the backend.
