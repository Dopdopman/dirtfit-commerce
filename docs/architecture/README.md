# DirtFit Commerce — Master Architecture Plan (Single Source of Truth)

> **Project:** E-Commerce Platform for Off-Road Motorcycles (Motocross, Enduro, Dual-Sport, Adventure) & Performance/Ergonomics Accessories, integrated with a **2D Rider Fit & Ergonomics Simulator**.  
> **Core Engineering Constraint:** **100% Pure JavaScript (ES Modules / ESM)** — zero TypeScript (`.ts`, `.tsx`, `tsconfig.json`). Uses **JSDoc** for type hints and **Zod (`.strict()`)** for runtime validation + OpenAPI 3.0 generation.  
> **Target Infrastructure Budget:** **\$0/month** (Free Tier Production Architecture).  
> **Current Status:** **Phase 0 Complete** — Monorepo scaffold, local Docker infrastructure, and Pure-JS guardrails verified.

---

## Architecture Specification Index

All implementation phases must strictly follow the 7 specification documents below:

| # | Document | Scope & Core Contents |
| :-: | :--- | :--- |
| **01** | [01-system-architecture-monorepo.md](./01-system-architecture-monorepo.md) | Decoupled Web + Modular Monolith API architecture, Pure JS ESM standards (zero-build internal packages, `BigInt -> Number` policy, locked compatible stack versions), full monorepo directory tree, 4-layer Clean Architecture, and module boundaries. |
| **02** | [02-ergonomics-rider-fit-engine.md](./02-ergonomics-rider-fit-engine.md) | Unified millimeter coordinate system, anthropometric estimator, progressive **Static/Rider Sag** physics, **Seat Width Wrap Loss**, footwear-aware ground contact (`MX_BOOTS`), **2D Analytical Inverse Kinematics** (Seated & Standing Attack stances), UV image calibration, and **Smart Upsell** engine. |
| **03** | [03-database-design-prisma.md](./03-database-design-prisma.md) | 17-entity ERD, complete Prisma Schema draft (`User`, `RefreshToken`, `Bike`, `BikeGeometrySpec`, `BikeMedia`, `Accessory`, `BikeAccessoryCompatibility`, `Order`, `InventoryReservation`, `IdempotencyKey`, `TestRideBooking`, `AuditLog`), PostgreSQL `CHECK` & Partial Unique constraints, `< 15ms` Smart Fit query strategy, **Lazy Expiration**, and **Seed Data Standard** (3 showrooms + 8+ real-world bikes). |
| **04** | [04-backend-modules-api-security.md](./04-backend-modules-api-security.md) | Fastify 5 plugin lifecycle, response envelope, **RFC 7807** errors, mandatory `BigInt -> Number` serialization policy, complete `/api/v1` endpoint catalog, **Refresh Token Rotation + Reuse Detection**, **Idempotent Checkout + `SELECT ... FOR UPDATE` + Lazy Expiration**, Payment Adapter Strategy (`PayOS`, `MockPaymentAdapter`, `COD`, `VNPay`, `Stripe`), and OWASP Top 10 checklist. |
| **05** | [05-frontend-ux-design-system.md](./05-frontend-ux-design-system.md) | **Anti-AI-Slop** *Industrial Motorsport / Technical Editorial* design manifesto, WCAG AA+ design tokens, Vietnamese-ready typography (`Plus Jakarta Sans`, `Be Vietnam Pro`, `JetBrains Mono` `tabular-nums`), sitemap, progressive disclosure layouts, **5-Layer SVG Simulator**, **Ghost Overlay**, and **Admin Calibration Tool**. |
| **06** | [06-devops-docker-cicd-deploy.md](./06-devops-docker-cicd-deploy.md) | Multi-stage non-root `Dockerfile` blueprints for API & Web, 1-command `docker-compose.yml`, GitHub Actions CI/CD + periodic cron sweeper, `.env.example` templates, and deep analysis of \$0 Free Tier limits and mitigations (Vercel, Render/Koyeb, Neon, Upstash, Cloudflare R2, Resend). |
| **07** | [07-implementation-roadmap.md](./07-implementation-roadmap.md) | 9-phase implementation roadmap (**Phase 0 → Phase 8**) with explicit dependency graph, deliverables, and verifiable **Definition of Done (DoD)** checklists. |

---

## Key Architecture Decision Records (ADR Highlights)

1. **Zero-Build Pure JS ESM Packages & Locked Versions:** `@dirtfit/ergonomics-engine` and `@dirtfit/shared` export `.js` ESM source directly without intermediate build steps. Package versions are locked and runtime-verified (`pnpm@10.28.2`, `fastify@5.12.8`, `zod@3.25.76`, `fastify-type-provider-zod@4.0.2`, `@fastify/swagger@9.9.5`, `prisma@6.19.3`, `next@15.5.29`, `react@19.2.9`).
2. **PostgreSQL `BIGINT` → JS Safe `Number` Policy:** Database columns store VND amounts as `BIGINT` (`BigInt` in Prisma) to avoid 32-bit `INT4` overflow (~2.147B VND) on multi-bike adventure orders. Every Repository/Mapper MUST convert `BigInt` to JS safe `Number` via `toSafeVndNumber()` before returning to Service/DTO/JSON/Next.js Client Components, eliminating `BigInt` serialization errors.
3. **Defense-in-Depth Inventory Locking + Lazy Expiration:** Combines `Idempotency-Key` + deadlock-safe `SELECT ... FOR UPDATE` (sorted by ID ascending) + 15-minute `InventoryReservation` TTL + PostgreSQL `CHECK (reserved_qty <= stock_qty)` + **inline Lazy Expiration during availability checks and checkout transactions** (never relying solely on 15-minute cron jobs).
4. **Payment Strategy & Realistic Seed Baseline:** Defaults to **PayOS (VietQR)** for production online deposits/payments, **MockPaymentAdapter** (`+ simulate-webhook`) for local/test/CI environments, and **COD** for accessories (`<= 20,000,000` VND). Includes 3 canonical showrooms (Hanoi, Da Nang, Ho Chi Minh City) and 8+ real-world dirtbikes with accurate geometry and compatible lowering/ergo accessories.
5. **No BullMQ Polling on Upstash Free Tier:** Avoids exhausting the 500k commands/month quota by using an **L1 In-Memory LRU Cache (30s)** ahead of Upstash L2 Cache, inline **Lazy Expiration**, and a lightweight GitHub Actions cron sweeper every 15 minutes.
6. **Cloudflare R2 + Presigned PUT + 4KB Magic Bytes Verification:** Serves high-res side-profile assets with zero egress fees, avoids buffering uploads through Render/Koyeb's 512MB RAM, and verifies MIME magic bytes via HTTP Range requests (`0-4095`) to block disguised executables or SVG XSS.
7. **Parametric Wireframe Fallback:** The 2D Simulator renders a millimeter-accurate parametric CAD wireframe directly from `BikeGeometrySpec` whenever a newly added motorcycle does not yet have a calibrated side-profile image.
