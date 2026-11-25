---
id: ordering-and-deposit-guide-en
slug: ordering-and-deposit-guide
locale: en
kicker: ORDERING & TEST RIDE OPERATIONS
title: Ordering, Deposit & Test Ride Guide
summary: End-to-end guide for selecting a motorcycle via the 2D Rider Fit Simulator, 15-minute inventory locks, PayOS VietQR payments, COD eligibility limits, order cancellation, and booking test rides at 3 DirtFit showrooms.
publicPath: /policies/ordering
version: 2.0.0
lastUpdated: 2026-11-25
---

DirtFit Commerce enforces transparent inventory locking, deterministic VND deposit calculations, and workshop-verified lowering bundles so every off-road motorcycle arrives pre-configured for your exact stature.

## [simulator-selection] Selecting a Motorcycle & Lowering Combo via 2D Simulator

1. Start from the **Quick Fit Bar** on the homepage or open `/bikes` with the **Smart Rider-Fit Filter** enabled (`heightCm`, `weightKg`, optional `inseamCm`, and `footwear`).
2. Open any motorcycle detail page (`/bikes/[slug]`) to adjust your riding gear and stance inside the real-time **2D Parametric Rider Fit Simulator**.
3. If the OEM seat height produces `TIP_TOE`, `ONE_FOOT_SHIFT`, or `TOO_TALL_UNSAFE`, toggle compatible ergonomic parts such as a **Lowering Link** (`-25mm` to `-30mm`), **Low Seat** (`-20mm` to `-25mm`), or **Bar Riser** (`+30mm`).
4. Click **Add Bike + Lowering Kit Bundle** to group the motorcycle and compatible accessories into one linked cart bundle (`bundleGroupId`), ensuring our workshop calculates installation labor (`installLaborVnd`) and sets up the kit prior to handover.

> Tip: Use `/compare` (**Ghost Overlay**) to superimpose any two motorcycles at real millimeter wheelbase scale before reserving.

## [inventory-hold-ttl] 15-Minute Inventory Reservation & Lazy Expiration

- Every checkout request requires an `Idempotency-Key` header so network retries never create duplicate orders or double charges.
- Inside an ACID PostgreSQL transaction (`SELECT ... FOR UPDATE`), DirtFit Commerce immediately reserves your motorcycle and accessory units for **15 minutes** (`reservationExpiresAt`).
- **Inline Lazy Expiration:** If a reservation expires without payment confirmation after 15 minutes, the unit is reclaimed immediately on the very next availability read or checkout attempt without waiting for a background cron job.
- You can inspect live remaining availability across `/bikes`, `/cart`, and `/checkout` at any time.

## [payment-payos-vietqr] Deposits, Full Purchases & PayOS VietQR Payments

- **Bike Deposit (`BIKE_DEPOSIT`):** Lock a motorcycle (plus optional compatible accessories) by paying the model-specific deposit amount in VND (`depositAmountVnd`), typically around 10% of vehicle price, plus any pre-delivery accessory/installation total included in the deposit or settled at handover per order breakdown.
- **Full Online Purchase (`FULL_PURCHASE`):** Pay `100%` of the order total upfront via online payment.
- **PayOS VietQR (Production Default):** Upon checkout, DirtFit generates a signed **PayOS** VietQR checkout link. Instant bank transfers settle via HMAC-verified webhooks, permanently committing stock (`COMMITTED`) and transitioning your order to `DEPOSIT_PAID` or `PAID`.
- All currency amounts are stored as exact integer **VND** (`BIGINT`) with zero hidden surcharges.

## [cod-policy] Cash on Delivery (COD) Rules & Limits

> Strict Policy: **Cash on Delivery (COD) is strictly prohibited for any order containing a motorcycle (`BIKE`).**

| Order Type                                   | Eligible for COD?         | Maximum Order Limit     | Notes                                       |
| :------------------------------------------- | :------------------------ | :---------------------- | :------------------------------------------ |
| `BIKE_DEPOSIT` (Motorcycle + optional parts) | **No (Strictly Blocked)** | N/A                     | Requires online deposit via PayOS VietQR    |
| `FULL_PURCHASE` (Includes motorcycle)        | **No (Strictly Blocked)** | N/A                     | Requires online payment                     |
| `ACCESSORY_ONLY` (Parts, gear, MX boots)     | **Yes**                   | **`<= 20,000,000 VND`** | Orders above 20,000,000 VND must pay online |

If an `ACCESSORY_ONLY` cart stays at or below **20,000,000 VND** and you choose `COD`, the order confirms immediately (`CONFIRMED`) and stock is committed right away.

## [order-cancellation] Cancelling an Order & Releasing Reserved Stock

- Orders in `PENDING_PAYMENT` can be cancelled immediately from **Account Hub (`/account`)** (`POST /api/v1/orders/:id/cancel`).
- Cancelling a `PENDING_PAYMENT` order transitions it to `CANCELLED` and **immediately releases** all `ACTIVE` `InventoryReservation` holds back into public catalog stock.
- Once an order reaches `DEPOSIT_PAID`, `PAID`, or `PREPARING`, please contact your assigned showroom advisor to coordinate modification, showroom transfer, or refund review under our warranty and returns terms.

## [test-ride-showrooms] Test Ride Bookings Across 3 DirtFit Showrooms

Before committing to a bike, book a 90-minute coached test ride session at `/test-ride`. Your saved **Rider Body Profile** and requested lowering setup attach to the booking so technicians can pre-set rear preload and install a low seat prior to your arrival.

| Showroom Code  | Location                      | Address                                  | Daily Time Slots                                           |
| :------------- | :---------------------------- | :--------------------------------------- | :--------------------------------------------------------- |
| `HN_LONG_BIEN` | DirtFit Hanoi — Long Bien     | 45 Co Linh, Long Bien District, Hanoi    | `09:00-10:30`, `10:30-12:00`, `14:00-15:30`, `15:30-17:00` |
| `DN_SON_TRA`   | DirtFit Da Nang — Son Tra     | 120 Ngo Quyen, Son Tra District, Da Nang | `09:00-10:30`, `10:30-12:00`, `14:00-15:30`, `15:30-17:00` |
| `HCM_THU_DUC`  | DirtFit Ho Chi Minh — Thu Duc | 88 Mai Chi Tho, Thu Duc City, HCMC       | `09:00-10:30`, `10:30-12:00`, `14:00-15:30`, `15:30-17:00` |

- **Driver License Requirement:** Valid **`A1`** (for <= 175cc models such as CRF150L or WR155R) or **`A2`** (for >= 175cc models such as CRF300L, KLX230, KTM 350 EXC-F, Husqvarna FE 350, Ténéré 700). Closed-course track demo slots are arranged for race-only CRF250R models.
- Each `(bike, showroom, date, timeSlot)` allows one active `PENDING` or `CONFIRMED` booking to prevent double-booking; cancelling frees the slot immediately.
