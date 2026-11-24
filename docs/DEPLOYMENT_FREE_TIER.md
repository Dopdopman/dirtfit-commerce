# DirtFit Commerce — $0/Month Free Tier Deployment & Operations Guide

This guide walks through provisioning **100% free infrastructure** across **Neon + Upstash + Cloudflare R2 + Render (or Koyeb) + Vercel**, configuring GitHub Actions CI/CD, and operating DirtFit Commerce safely in production.

---

## 1. Architecture Summary ($0/Month Stack)

| Service | Provider | Free Quota | Role |
| :--- | :--- | :--- | :--- |
| **Frontend** (`apps/web`) | **Vercel Hobby** | 100 GB/mo, Edge CDN | Next.js 15 App Router, client-side 60fps simulator (`vercel.json`) |
| **Backend API** (`apps/api`) | **Render Free Web Service** *(or Koyeb Free)* | 512 MB RAM, 0.1–0.5 vCPU | Pure JS Fastify Docker container (`apps/api/Dockerfile`, `render.yaml`) |
| **PostgreSQL 16** | **Neon Free** | 0.5 GB storage, 190 hrs/mo | Pooled `DATABASE_URL` at runtime + direct `DIRECT_URL` for CI migrations |
| **Redis 7 Cache & Rate Limit** | **Upstash Free** | 500,000 commands/mo | L2 catalog cache (behind 30s L1 LRU) + sensitive-route rate limiting |
| **Media & Blueprints** | **Cloudflare R2** | 10 GB storage, 0 egress | Direct browser `PUT` via Presigned URL + 4KB Magic Bytes verification |
| **Cron & CI/CD** | **GitHub Actions** | 2,000 mins/mo (public unlimited) | PR gate (`ci.yml`), DB migration + deploy (`cd.yml`), 15-min sweeper (`sweeper-cron.yml`) |

---

## 2. Step-by-Step Infrastructure Setup

### Step 2.1: Neon PostgreSQL (Free Tier)
1. Create a Neon project (`ap-southeast-1` Singapore region to minimize latency from Vietnam).
2. Copy **two connection strings**:
   - **Pooled URL (`DATABASE_URL`):** Append `?sslmode=require&pgbouncer=true&connection_limit=5&pool_timeout=20` for runtime Fastify/Prisma traffic.
   - **Direct URL (`DIRECT_URL`):** Non-pooled endpoint (`?sslmode=require`) strictly for `prisma migrate deploy` in `.github/workflows/cd.yml`.

### Step 2.2: Upstash Redis (Free Tier)
1. Create a Redis database in Singapore (`ap-southeast-1`) with **TLS enabled**.
2. Copy the `rediss://default:<password>@<host>:6379` URI as `REDIS_URL`.
3. Note: DirtFit does **not** run BullMQ workers against Upstash; stock reclamation uses inline **Lazy Expiration** plus the 15-minute GitHub Actions cron (`sweeper-cron.yml`).

### Step 2.3: Cloudflare R2 Object Storage (Free Tier)
1. Create a bucket named `dirtfit-media`.
2. Attach a custom domain (e.g., `cdn.dirtfit.vn`) or enable the R2 public dev URL -> use as `R2_PUBLIC_BASE_URL` and `NEXT_PUBLIC_CDN_URL`.
3. Configure **Bucket CORS Policy** so browser uploads (`PUT`) from your frontend origin succeed:
   ```json
   [
     {
       "AllowedOrigins": ["https://dirtfit.vn", "https://www.dirtfit.vn"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Create an **Object Read & Write** API Token scoped strictly to `dirtfit-media` and save:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME=dirtfit-media`

### Step 2.4: Payment & Email Providers (Free / Sandbox)
- **PayOS:** Register merchant channel, set webhook URL to `https://api.dirtfit.vn/api/v1/payments/webhooks/payos`, and copy `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`.
- **Resend:** Create API key (`RESEND_API_KEY`) and verify sending domain (`EMAIL_FROM`).

### Step 2.5: Backend API on Render (`render.yaml`)
1. In Render Dashboard, choose **New -> Blueprint** and point to this repository (`render.yaml`).
2. Render pre-fills `NODE_ENV=production`, `ENABLE_MOCK_PAYMENT=false`, `PAYMENT_DEFAULT_PROVIDER=PAYOS`, `STORAGE_DRIVER=r2`, `RUN_MIGRATIONS=false`, `RUN_SEED=false`, and generates 64-byte secrets for `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `COOKIE_SECRET`, and `CRON_HMAC_SECRET`.
3. Fill in the remaining `sync: false` secrets:
   - `APP_URL=https://dirtfit.vn`
   - `API_URL=https://api.dirtfit.vn`
   - `CORS_ALLOWED_ORIGINS=https://dirtfit.vn,https://www.dirtfit.vn`
   - `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`
   - `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `RESEND_API_KEY`
4. Copy the Render service **Deploy Hook URL** (`Settings -> Deploy Hook`) for GitHub Actions CD.

> **Cross-Origin HttpOnly Cookie Guidance:**
> - **Best (Same root domain):** Bind `dirtfit.vn` (Vercel) and `api.dirtfit.vn` (Render) -> set `COOKIE_SAME_SITE=lax` and `COOKIE_SECURE=true`.
> - **Fallback (Separate `.vercel.app` & `.onrender.com` domains):** Keep `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true` (configured by default in `render.yaml`).

### Step 2.6: Frontend Web on Vercel Hobby (`vercel.json`)
1. Import repository in Vercel with **Root Directory** set to `apps/web` (or monorepo root with `apps/web` selected; `vercel.json` lives at repo root).
2. Set Environment Variables (never place secrets in `NEXT_PUBLIC_*`):
   - `NEXT_PUBLIC_API_URL=https://api.dirtfit.vn`
   - `INTERNAL_API_URL=https://api.dirtfit.vn`
   - `NEXT_PUBLIC_CDN_URL=https://cdn.dirtfit.vn`
   - `NEXT_PUBLIC_APP_NAME=DirtFit Commerce`
3. Copy the Vercel **Deploy Hook URL** (`Project Settings -> Git -> Deploy Hooks`) if triggering frontend redeploys from `cd.yml`.

---

## 3. GitHub Repository Secrets Checklist

Add these secrets under **Settings -> Secrets and variables -> Actions** so `cd.yml` and `sweeper-cron.yml` run cleanly:

| Secret Name | Used By | Example / Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | `cd.yml` | Neon pooled URL |
| `DIRECT_URL` | `cd.yml` | Neon direct non-pooled URL (mandatory for `prisma migrate deploy`) |
| `API_DEPLOY_HOOK_URL` | `cd.yml` | Render / Koyeb deploy hook webhook URL |
| `VERCEL_DEPLOY_HOOK_URL` | `cd.yml` | Optional Vercel deploy hook URL |
| `API_BASE_URL` | `cd.yml`, `sweeper-cron.yml` | `https://api.dirtfit.vn` |
| `WEB_BASE_URL` | `cd.yml` | `https://dirtfit.vn` |
| `CRON_HMAC_SECRET` | `sweeper-cron.yml` | Must match `CRON_HMAC_SECRET` configured in Render (`>= 32` chars) |

---

## 4. Operational Runbook (Migrations, Rollbacks & Secret Rotation)

1. **Zero-Downtime Migrations (Expand-and-Contract):**
   - `cd.yml` always applies migrations **before** restarting API containers (`prisma migrate deploy` over `DIRECT_URL`).
   - Always make schema migrations backward-compatible with the previous running API version (add nullable columns first; drop unused columns in a follow-up PR).
2. **Rollback Procedure:**
   - **Code Rollback:** Redeploy the previous known-good commit in Render/Vercel (backward-compatible DB columns remain untouched).
   - **Failed Migration Recovery:** Inspect `_prisma_migrations` via Neon Console SQL Editor, fix forward with a new migration PR, or resolve cleanly with `prisma migrate resolve --rolled-back <migration_name>` using `DIRECT_URL`.
3. **Secret Rotation:**
   - Generate fresh 64-char hex strings via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - Rotating `JWT_ACCESS_SECRET` invalidates current 15-minute access tokens immediately (browser clients transparently obtain new ones via `POST /api/v1/auth/refresh`).
   - Rotating `CRON_HMAC_SECRET` must be updated simultaneously in **Render** and **GitHub Actions Secrets**.
   - After rotating `REFRESH_TOKEN_PEPPER` or `COOKIE_SECRET`, existing sessions will re-authenticate cleanly on next visit.

---

## 5. Security Audit Exceptions (`pnpm.auditConfig.ignoreGhsas`)

The CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs `pnpm audit --prod --audit-level=high` as a **fail-hard gate** so any newly discovered high or critical production vulnerability blocks merging. Only two upstream major-version advisories are explicitly allow-listed in root [`package.json`](../package.json):

| GHSA / CVE | Package & Path | Reason Locked | Active Mitigation & Removal Plan |
| :--- | :--- | :--- | :--- |
| **GHSA-mrhx-c7xc-m3w5** (`CVE-2023-54404`, High) | `zod@3.25.76` (`apps/api`, `packages/shared`) | `fastify-type-provider-zod@4.0.2` requires Zod v3; upstream patch (`>=4.6.6`) requires upgrading to Zod v4 + `fastify-type-provider-zod` v5+. | Fastify enforces a strict 1 MiB body limit by default and all public/admin array schemas apply explicit `.max()` bounds. Remove exception when upgrading Fastify Zod adapter + Zod v4. |
| **GHSA-ggr8-5vv4-36mx** (`CVE-2026-40345`, High) | `deepmerge-ts@7.1.5` via `prisma@6.19.3 > @prisma/config` | Only `@prisma/config` CLI dependency; `deepmerge-ts >= 8.0.0` is a major bump outside Prisma 6's declared semver range. | Never invoked at HTTP runtime and never parses untrusted user JSON (strict `JSON.parse` cannot construct circular graphs). Remove exception upon upgrading to Prisma v7+. |
