# DirtFit Commerce

A specialized e-commerce platform for **Off-Road, Motocross, Enduro, Dual-Sport, and Adventure Motorcycles** plus compatible ergonomic/protection accessories, powered by an interactive **2D Parametric Rider Fit & Ergonomics Simulator**.

> **Strict Engineering Mandate:** **100% Pure JavaScript (ES Modules / ESM)** — zero TypeScript (`.ts`, `.tsx`, `tsconfig.json`, or `typescript`). Uses **JSDoc** for type hints and **Zod (`.strict()`)** for runtime validation and automatic OpenAPI 3.0 generation.

---

## Key Capabilities

- **60fps 2D Rider Fit Simulator & Ghost Overlay:** Physics-backed suspension sag (`Static Sag` + `Rider Sag`), seat width & boot ankle-flexion ground reach (`FLAT_FOOT`, `BALLS_OF_FEET`, `TIP_TOE`, `ONE_FOOT_SHIFT`, `TOO_TALL_UNSAFE`), 2D analytical inverse kinematics (Seated & Standing Attack stances), side-by-side Ghost Overlay comparison (`/compare`), and smart accessory lowering bundle upsells.
- **Grounded AI Support Chatbot (`SupportChatWidget.jsx`) & `@dirtfit/knowledge`:** Zero-hallucination grounded pipeline backed by local bilingual EN/VI BM25 policy retrieval, `CatalogCache`, and real `@dirtfit/ergonomics-engine` evaluations; supports Google Gemini Free Tier (`gemini-2.5-flash`) with instant `GroundedFallbackAdapter` protection, prompt-injection pre-filtering, clickable `/policies/*` citations, interactive Mini Fit Cards, and anonymous-to-authenticated session merge.
- **Google OAuth 2.0 + OIDC & Security:** Authorization Code + PKCE S256 + encrypted `df_oauth_tx` cookie + 60s Redis One-Time Ticket cross-origin handoff, Argon2id password hashing, Refresh Token Rotation with family-wide Reuse Detection, in-memory JWT + Single-Flight Refresh Queue, 4KB Magic Bytes media inspection, RFC 7807 `application/problem+json` errors, and immutable `AuditLog`.
- **High-Concurrency Inventory & Payments:** PostgreSQL `SELECT ... FOR UPDATE` row locking sorted deterministically to eliminate deadlocks, inline **Lazy Expiration** reclaiming expired 15-minute holds without waiting for cron, `Idempotency-Key` checkout protection, PayOS HMAC webhooks, COD eligibility guard (`<= 20,000,000 VND`, accessories only), and non-prod Mock payment adapter.
- **Real Product Media Gallery & Rich Cart UX (`v2.1`):** Strictly separates commercial product photography (`HERO` / `GALLERY` -> `coverImageUrl`, `galleryImages` with Radix Lightbox + automatic 2D Parametric Wireframe fallback) from `SIDE_PROFILE_BLUEPRINT` 2D calibration imagery; adds full Cloudflare R2 upload lifecycle (`Presign -> PUT -> 4KB Magic Bytes`) for both Motorcycles and Accessories (`/admin/bikes/[id]`, `/admin/accessories`), and enriches `/cart`, `/checkout`, `/account` Orders, `/admin/orders`, and Chatbot `MiniFitCard` with live thumbnails and canonical `?sku=` deep-links.
- **Bilingual Storefront (EN Default / VI) & Admin Portal (`/admin/*`):** Cookie-persisted SSR + client EN/VI switching, Industrial Technical Dashboard, Bike & Geometry CRUD, **Real Photo Gallery Manager + Interactive 6-Anchor UV Blueprint Calibration Tool**, Compatibility Matrix editor, Order State Machine controls, 3-Showroom Test Ride scheduler, and `ADMIN`-only Audit Log diff & anonymized Chat Metrics.

---

## Architecture & Tech Stack

| Layer                                     | Technology & Pinned Version                                                  | Notes                                                                          |
| :---------------------------------------- | :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Runtime & Monorepo**                    | `Node.js 22.x`, `pnpm@10.28.2`, `turbo@2.11.13`                              | Native ESM (`"type": "module"`), zero-build internal packages                  |
| **Backend (`apps/api`)**                  | `fastify@5.12.8`, `zod@3.25.76`, `prisma@6.19.3`, `ioredis@6.1.0`            | Clean Architecture modular monolith (`/api/v1`), Pino redaction                |
| **Frontend (`apps/web`)**                 | `next@15.5.29` (`.jsx`), `react@19.2.9`, `@radix-ui/*`, `tailwindcss@3.4.19` | App Router + Next.js standalone Docker output                                  |
| **Engine (`packages/ergonomics-engine`)** | Pure JS ESM (zero runtime deps)                                              | Shared 1:1 between browser (60fps) and Fastify Smart Rider-Fit API             |
| **Shared (`packages/shared`)**            | `zod@3.25.76`                                                                | `.strict()` DTO schemas, error codes, `ALLOWED_ORDER_TRANSITIONS`, VND helpers |
| **Infrastructure & CI/CD**                | Docker multi-stage non-root Alpine, GitHub Actions, Trivy                    | Designed for **$0/month Free Tier** (Neon, Upstash, R2, Render/Koyeb, Vercel)  |

---

## Monorepo Layout

```text
dirtfit-commerce/
├── .github/workflows/          # ci.yml (5 jobs), cd.yml, sweeper-cron.yml
├── apps/
│   ├── api/                    # Fastify 5 API, Prisma schema/migrations, Dockerfile, entrypoint.mjs
│   └── web/                    # Next.js 15 Storefront, /policies/*, & /admin Portal, standalone Dockerfile
├── packages/
│   ├── ergonomics-engine/      # Sag, foot contact, 2D IK kinematics & UV calibration math
│   ├── knowledge/              # Bilingual EN/VI policy markdown docs, static manifest & BM25 retriever
│   └── shared/                 # Shared enums, errors, VND BigInt/Number converters, Zod schemas
├── tests/
│   └── system/                 # Tier 3: Playwright Chromium E2E specs (Pure JS ESM)
├── docs/
│   ├── DEPLOYMENT_FREE_TIER.md # Step-by-step $0/month production deployment & runbook
│   └── architecture/           # Single Source of Truth master architecture docs (00–13)
├── scripts/
│   ├── check-pure-js.mjs       # Workspace guardrail blocking TypeScript artifacts
│   └── smoke-stack.mjs         # Live full-stack HTTP & API integration smoke check
├── playwright.config.mjs       # Tier 3 Playwright configuration (Chromium headless, workers: 1)
├── docker-compose.yml          # Local dev PostgreSQL 16 + Redis 7 + Adminer (--profile tools)
├── docker-compose.prod.yml     # 1-command full 4-container local production stack
├── render.yaml                 # Render Free Tier Docker service blueprint
└── vercel.json                 # Vercel security headers configuration
```

---

## Quick Start

### Option A: 1-Command Full-Stack Production Docker Compose

Runs `postgres`, `redis`, `api` (non-root `dirtfit`, `NODE_ENV=production`), and `web` (non-root `nextjs`, Next.js `standalone`) locally:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verify health & live API/SSR integration:

```bash
pnpm smoke -- --api-url http://127.0.0.1:4000 --web-url http://127.0.0.1:3000 --expect-prod
```

Open `http://localhost:3000` (Storefront) or `http://localhost:3000/admin` (Admin Portal). Tear down with:

```bash
docker compose -f docker-compose.prod.yml down
```

### Option B: Local Development Mode (Hot Reload)

```bash
# 1. Install dependencies & configure environment files
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 2. Start PostgreSQL 16 & Redis 7
docker compose up -d --wait postgres redis

# 3. Generate Prisma Client, apply migrations & seed real-world bikes/accessories
pnpm --filter @dirtfit/api run db:generate
pnpm --filter @dirtfit/api run db:migrate:deploy
pnpm --filter @dirtfit/api run db:seed

# 4. Run API (:4000) + Web (:3000) concurrently
pnpm dev
```

---

## Demo Accounts (Seed Data)

| Role            | Email              | Password             | Access Scope                                                                              |
| :-------------- | :----------------- | :------------------- | :---------------------------------------------------------------------------------------- |
| **ADMIN**       | `admin@dirtfit.vn` | `Admin@DirtFit2026!` | Full Storefront, Admin Portal (`/admin/*`), Blueprint Calibration, Audit Logs             |
| **SALES_STAFF** | `sales@dirtfit.vn` | `Sales@DirtFit2026!` | Stock/status updates, Orders State Machine, 3-Showroom Test Rides                         |
| **CUSTOMER**    | `rider@dirtfit.vn` | `Rider@DirtFit2026!` | Storefront, Saved Body Profiles, Cart, Checkout, Test Rides (blocked `403` on `/admin/*`) |

---

## Useful Workspace Commands

| Command                                | Description                                                                  |
| :------------------------------------- | :--------------------------------------------------------------------------- |
| `pnpm dev`                             | Run Fastify API & Next.js Web concurrently in watch mode                     |
| `pnpm test:unit`                       | Tier 1: Run fast parallel unit tests across all 5 packages (0 DB/Redis)      |
| `pnpm test:integration`                | Tier 2: Run sequential Supertest HTTP integration suites (Postgres + Redis)  |
| `pnpm test:system`                     | Tier 3: Run 7 Playwright Chromium end-to-end specs against API + Web         |
| `pnpm test`                            | Run Tier 1 (`test:unit`) + Tier 2 (`test:integration`)                       |
| `pnpm check:pure-js`                   | Verify 100% Pure JavaScript ESM compliance across all files & `package.json` |
| `pnpm lint`                            | Run ESLint with JSDoc, React, and React Hooks rules (zero warnings policy)   |
| `pnpm format:check`                    | Verify Prettier formatting across workspace                                  |
| `pnpm --filter @dirtfit/web build`     | Build Next.js production bundle                                              |
| `pnpm audit --prod --audit-level=high` | Check production dependency vulnerability advisories                         |
| `pnpm smoke`                           | Run live API & Web SSR smoke verification against running containers         |

---

## Documentation & Deployment

- **\$0/Month Free Tier Deployment & Operations Guide:** [`docs/DEPLOYMENT_FREE_TIER.md`](./docs/DEPLOYMENT_FREE_TIER.md)
- **Master Architecture Index:** [`docs/architecture/README.md`](./docs/architecture/README.md)
- **v2.0 Expansion Roadmap & DoD Checklists:** [`docs/architecture/11-v2-expansion-roadmap.md`](./docs/architecture/11-v2-expansion-roadmap.md)
- **v2.1 Real Product Media & Rich Cart Architecture / Roadmap:** [`docs/architecture/12-real-product-media-and-rich-cart.md`](./docs/architecture/12-real-product-media-and-rich-cart.md) · [`docs/architecture/13-v21-media-cart-roadmap.md`](./docs/architecture/13-v21-media-cart-roadmap.md)
