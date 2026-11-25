# DirtFit Commerce — Master Architecture Plan (Single Source of Truth)

> **Project:** E-Commerce Platform for Off-Road Motorcycles (Motocross, Enduro, Dual-Sport, Adventure) & Performance/Ergonomics Accessories, integrated with a **2D Rider Fit & Ergonomics Simulator**, **Google OAuth 2.0**, and **Grounded AI Support Chatbot**.  
> **Core Engineering Constraint:** **100% Pure JavaScript (ES Modules / ESM)** — zero TypeScript (`.ts`, `.tsx`, `tsconfig.json`). Uses **JSDoc** for type hints and **Zod (`.strict()`)** for runtime validation + OpenAPI 3.0 generation.  
> **Storefront Localization:** Full bilingual **EN / VI** (English default via `dirtfit_locale` cookie, SSR + Client hydration-safe).  
> **Target Infrastructure Budget:** **\$0/month** (Free Tier Production Architecture).  
> **Current Status:** **v1.0.0 Complete** (Phases 0–8 verified, 4/4 GitHub Actions CI jobs green, 70/70 tests passed) — **Expansion Master Plan v2.0 (Phases 9–12) Approved for Execution**.

---

## Architecture Specification Index

All implementation phases strictly follow the 11 specification documents below (`01`–`07` for `v1.0.0` core; `08`–`11` for `v2.0` expansion):

### Core Platform Specifications (`v1.0.0` — Phases 0 → 8)

| # | Document | Scope & Core Contents |
| :-: | :--- | :--- |
| **01** | [01-system-architecture-monorepo.md](./01-system-architecture-monorepo.md) | Decoupled Web + Modular Monolith API architecture, Pure JS ESM standards (zero-build internal packages, `BigInt -> Number` policy, locked compatible stack versions), full monorepo directory tree, 4-layer Clean Architecture, module boundaries, and `v2.0` delta. |
| **02** | [02-ergonomics-rider-fit-engine.md](./02-ergonomics-rider-fit-engine.md) | Unified millimeter coordinate system, anthropometric estimator, progressive **Static/Rider Sag** physics, **Seat Width Wrap Loss**, footwear-aware ground contact (`MX_BOOTS`), **2D Analytical Inverse Kinematics** (Seated & Standing Attack stances), UV image calibration, **Smart Upsell** engine, and `v2.0` Chatbot live-grounding integration. |
| **03** | [03-database-design-prisma.md](./03-database-design-prisma.md) | 17-entity `v1.0.0` ERD + `v2.0` expansion to 20 entities (`OAuthAccount`, `ChatSession`, `ChatMessage`), PostgreSQL `CHECK` & Partial Unique constraints, `< 15ms` Smart Fit query strategy, **Lazy Expiration**, and **Seed Data Standard** (3 showrooms + 8 real-world bikes). |
| **04** | [04-backend-modules-api-security.md](./04-backend-modules-api-security.md) | Fastify 5 plugin lifecycle, response envelope, **RFC 7807** errors, mandatory `BigInt -> Number` serialization policy, `/api/v1` endpoint catalog, **Refresh Token Rotation + Reuse Detection**, **Idempotent Checkout + `SELECT ... FOR UPDATE` + Lazy Expiration**, Payment Adapters (`PayOS`, `Mock`, `COD`, `VNPay`, `Stripe`), OWASP Top 10 checklist, and `v2.0` API/security delta. |
| **05** | [05-frontend-ux-design-system.md](./05-frontend-ux-design-system.md) | **Anti-AI-Slop** *Industrial Motorsport / Technical Editorial* design manifesto, WCAG AA+ design tokens, bilingual **EN/VI** typography (`Plus Jakarta Sans`, `Be Vietnam Pro`, `JetBrains Mono` `tabular-nums`), sitemap, progressive disclosure layouts, **5-Layer SVG Simulator**, **Ghost Overlay**, **Admin Calibration Tool**, and `v2.0` Policy/OAuth/Chat UI delta. |
| **06** | [06-devops-docker-cicd-deploy.md](./06-devops-docker-cicd-deploy.md) | Multi-stage non-root `Dockerfile` blueprints for API & Web, 1-command `docker-compose.yml`, GitHub Actions CI/CD + periodic cron sweeper, `.env.example` templates, \$0 Free Tier limits & mitigations, and `v2.0` packaging/Playwright CI delta. |
| **07** | [07-implementation-roadmap.md](./07-implementation-roadmap.md) | 9-phase `v1.0.0` roadmap (**Phase 0 → Phase 8**, all completed) with explicit dependency graph, deliverables, and verified **Definition of Done (DoD)** checklists. |

### Expansion Master Plan (`v2.0` — Phases 9 → 12)

| # | Document | Scope & Core Contents |
| :-: | :--- | :--- |
| **08** | [08-google-oauth-architecture.md](./08-google-oauth-architecture.md) | **Google OAuth 2.0 + OIDC (RFC 9700)** với PKCE `S256` + `state` + `nonce` (`jose` RS256 JWKS), cookie mã hóa `df_oauth_tx` (0 lệnh Upstash), **One-Time Ticket Exchange (`60s`)** an toàn cho cross-origin Vercel ↔ Render, bảng `OAuthAccount`, ma trận Account Linking (Cases A–H), `MockGoogleOAuthAdapter` (chặn tuyệt đối ở production) và UX `/login`, `/auth/callback`, `/account`. |
| **09** | [09-ai-chatbot-knowledge-prompts.md](./09-ai-chatbot-knowledge-prompts.md) | **AI Support Chatbot Grounded 100%** (\$0/tháng): internal package **`@dirtfit/knowledge`** (4 tài liệu EN/VI đóng gói an toàn cho Docker & Vercel + 3 trang `/policies/*`), hệ thống **Prompt Governance** (`prompts/*.md`), Intent Router + Local BM25 Retriever (`< 2MB` RAM) + Live `CatalogCache` + **`@dirtfit/ergonomics-engine`**, `GeminiChatAdapter` + `GroundedFallbackAdapter`, bảng `ChatSession`/`ChatMessage`, OWASP LLM Top 10 và `SupportChatWidget.jsx`. |
| **10** | [10-testing-pyramid-unit-integration-system.md](./10-testing-pyramid-unit-integration-system.md) | **Kiến trúc Kiểm thử 3 Tầng (Pure JS ESM):** Tầng 1 **Unit (`Vitest`)**, Tầng 2 **Integration (`Vitest` + `Supertest` qua HTTP socket `port: 0`, tuần tự)**, Tầng 3 **System / E2E (`Playwright` Chromium — 6 kịch bản hộp đen `tests/system/`)**, chuẩn hóa scripts root và job `system-e2e` trên GitHub Actions. |
| **11** | [11-v2-expansion-roadmap.md](./11-v2-expansion-roadmap.md) | Lộ trình triển khai **Phase 9 → Phase 12**, đồ thị phụ thuộc, **Definition of Done (DoD)** kiểm chứng tự động từng Phase, bảng đồng bộ 10 biến môi trường mới, hướng dẫn cấu hình **Google Cloud Console OAuth** & **Google AI Studio Gemini Free Tier**, và Risk Register `v2.0`. |

---

## Key Architecture Decision Records (ADR Highlights)

1. **Zero-Build Pure JS ESM Packages & Locked Versions:** `@dirtfit/ergonomics-engine`, `@dirtfit/shared`, and (v2.0) `@dirtfit/knowledge` export raw `.js` ESM source directly without intermediate build steps. Locked runtime-verified versions: `pnpm@10.28.2`, `fastify@5.12.8`, `zod@3.25.76`, `fastify-type-provider-zod@4.0.2`, `@fastify/swagger@9.9.5`, `prisma@6.19.3`, `next@15.5.29`, `react@19.2.9`.
2. **PostgreSQL `BIGINT` → JS Safe `Number` Policy:** Database columns store VND amounts as `BIGINT` (`BigInt` in Prisma). Every Repository/Mapper MUST convert `BigInt` to JS safe `Number` via `toSafeVndNumber()` before returning to Service/DTO/JSON/Next.js Client Components.
3. **Defense-in-Depth Inventory Locking + Lazy Expiration:** Combines `Idempotency-Key` + sorted `SELECT ... FOR UPDATE` + 15-minute `InventoryReservation` TTL + PostgreSQL `CHECK (reserved_qty <= stock_qty)` + inline **Lazy Expiration**.
4. **Payment Strategy & Realistic Seed Baseline:** Defaults to **PayOS (VietQR)** in production, **MockPaymentAdapter** (`+ simulate-webhook` / `complete`) in non-prod/CI only, and **COD** for accessories `<= 20,000,000` VND. Seeds 3 canonical showrooms (`HN_LONG_BIEN`, `DN_SON_TRA`, `HCM_THU_DUC`) and 8 real-world bikes.
5. **No BullMQ Polling on Upstash Free Tier:** Uses **L1 In-Memory LRU Cache (30s)** ahead of Upstash L2 Cache, inline **Lazy Expiration**, and a 15-minute GitHub Actions cron sweeper (`sweeper-cron.yml`, extended in `v2.0` to also prune expired guest `ChatSession`s).
6. **Cloudflare R2 + Presigned PUT + 4KB Magic Bytes Verification:** Direct browser upload with zero egress fees and server-side HTTP Range (`0-4095`) magic-byte validation blocking disguised executables and SVG XSS.
7. **Parametric Wireframe Fallback:** 2D Simulator renders a millimeter-accurate CAD wireframe directly from `BikeGeometrySpec` whenever a bike lacks a calibrated side-profile image.
8. **Google OAuth 2.0 PKCE + Encrypted `df_oauth_tx` Cookie + One-Time Ticket Exchange (`v2.0`):** Keeps OAuth initiation at **0 Upstash commands**, prevents token leakage in URLs across `*.vercel.app` ↔ `*.onrender.com`, verifies Google `id_token` via zero-dep `jose` JWKS (`email_verified === true`), and auto-merges Guest Cart + Guest Chat on exchange.
9. **Zero-Hallucination Grounded AI Chatbot + Shared `@dirtfit/knowledge` (`v2.0`):** Bundles bilingual policy docs inside a workspace package with static `new URL(..., import.meta.url)` manifest + `outputFileTracingIncludes` (100% safe for `turbo prune --docker` & Vercel standalone), runs local BM25 (`< 2MB` RAM) + live `CatalogCache` + `@dirtfit/ergonomics-engine`, and pairs `GeminiChatAdapter` with deterministic `GroundedFallbackAdapter`.
10. **3-Tier Pure-JS Testing Pyramid (`v2.0`):** Separates ultra-fast **Unit (`Vitest`)**, real-socket sequential **Integration (`Vitest` + `Supertest`)**, and full-stack browser **System E2E (`Playwright` Chromium)** with dedicated CI job and zero paid API keys.
