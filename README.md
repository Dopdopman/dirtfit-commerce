# DirtFit Commerce

A production-grade e-commerce platform specialized in **Off-Road, Motocross, Enduro, Dual-Sport, and Adventure Motorcycles** alongside compatible ergonomics/protection parts, featuring an interactive **2D Parametric Rider Fit & Ergonomics Simulator**.

> **Strict Engineering Mandate:** **100% Pure JavaScript (ES Modules / ESM)** — zero TypeScript (`.ts`, `.tsx`, `tsconfig.json`). Uses **JSDoc** for editor type hints and **Zod (`.strict()`)** for runtime validation and automatic OpenAPI 3.0 generation.

---

## Core Differentiator: 2D Rider Fit & Ergonomics Simulator

Seat height is the #1 purchase barrier for dirtbike and adventure riders. DirtFit solves this with a physics- and analytical-geometry-backed simulator shared between the browser (60fps) and backend API:

- **Suspension Sag Physics:** Computes static and rider sag from suspension travel, progression linkage alpha, rider + gear weight, and spring rate ratio to derive **Effective Seat Height (mm)**.
- **Seat Width & Footwear Mechanics:** Accounts for seat edge wrap loss, lateral leg splay, and boot ankle-flexion limits (`SNEAKERS`, `ADV_BOOTS`, `MX_BOOTS`) to classify ground reach (`FLAT_FOOT`, `BALLS_OF_FEET`, `TIP_TOE`, `ONE_FOOT_SHIFT`, `TOO_TALL_UNSAFE`).
- **2D Analytical Inverse Kinematics (Rider Triangle):** Solves joint coordinates and ergonomic angles (knee, hip, torso lean, elbow) for both **Seated Cruising** and **Standing Off-Road Attack** stances.
- **Ghost Overlay & Smart Upsell:** Millimeter-accurate 2-bike overlay comparison plus compatibility-aware recommendations for lowering links, low seats, and bar risers with 1-click bundle add-to-cart.

---

## Locked Pure JS ESM Tech Stack

| Layer                     | Technology & Pinned Version                                                                    | Notes                                                                                   |
| :------------------------ | :--------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **Runtime & Monorepo**    | `Node.js >=22.11.0 <23`, `pnpm@10.28.2`, `turbo@2.11.13`                                       | Native ESM (`"type": "module"`), zero-build internal packages                           |
| **Backend (`apps/api`)**  | `fastify@5.12.8`, `zod@3.25.76`, `fastify-type-provider-zod@4.0.2`, `@fastify/swagger@9.9.5`   | Modular Monolith (Clean Architecture), RFC 7807 errors, Pino logs                       |
| **Database & Cache**      | `prisma@6.19.3`, PostgreSQL 16, Redis 7 (`ioredis@6.1.0`, `lru-cache@11.5.3`)                  | `BIGINT` VND in DB → safe `Number` in JS/API; `SELECT ... FOR UPDATE` + Lazy Expiration |
| **Auth & Security**       | `argon2@0.45.2`, `@fastify/jwt@10.2.9`, `@fastify/helmet@13.2.0`, `@fastify/rate-limit@11.3.0` | Refresh Token Rotation + Reuse Detection, RBAC, OWASP Top 10                            |
| **Frontend (`apps/web`)** | `next@15.5.29` (App Router `.jsx`), `react@19.2.9`, `tailwindcss@3.4.19`                       | Industrial Motorsport / Technical Editorial UI (`tabular-nums`)                         |
| **Quality & Testing**     | `eslint@9.39.5`, `eslint-plugin-jsdoc@65.5.4`, `prettier@3.10.1`, `vitest@3.2.7`               | Automated Pure-JS guardrail (`check:pure-js`)                                           |

---

## Monorepo Structure

```text
dirtfit-commerce/
├── apps/
│   ├── api/                        # Fastify 5 Modular Monolith REST API (/api/v1)
│   └── web/                        # Next.js 15 App Router Storefront & Admin Portal (.jsx)
├── packages/
│   ├── ergonomics-engine/          # Zero-dependency pure JS physics & 2D IK engine
│   └── shared/                     # Shared Zod (.strict()) schemas, enums, errors, VND helpers
├── docs/
│   └── architecture/               # Master Architecture Plan (Single Source of Truth)
├── scripts/
│   └── check-pure-js.mjs           # Enforces 100% Pure JS ESM (zero TypeScript)
└── docker-compose.yml              # Local PostgreSQL 16, Redis 7, Adminer (--profile tools)
```

---

## Local Quick Start (Phase 0)

### Prerequisites

- **Node.js** `22.x` (`>=22.11.0 <23`)
- **pnpm** `10.x` (`corepack enable`)
- **Docker** + **Docker Compose**

### Setup & Verification

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Start local PostgreSQL 16 & Redis 7
docker compose up -d --wait postgres redis

# 3. Run Pure-JS guardrail, lint, format, stack compatibility & test checks
pnpm check:pure-js
pnpm lint
pnpm format:check
pnpm verify:compat
pnpm test
```

> **Environment templates:** Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env` when starting API/Web development in later phases.

---

## Architecture & Implementation Status

- **Master Plan & ADRs:** [`docs/architecture/README.md`](./docs/architecture/README.md)
- **Roadmap:** [`docs/architecture/07-implementation-roadmap.md`](./docs/architecture/07-implementation-roadmap.md)
- **Current Milestone:** **Phase 0 (Monorepo Scaffold, Local Infrastructure & Pure-JS Guardrails)** complete; ready for **Phase 1 (`@dirtfit/ergonomics-engine` & `@dirtfit/shared`)**.
