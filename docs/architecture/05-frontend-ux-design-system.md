# 05. Frontend UX Architecture & Anti-AI Design System

> **Stack:** Next.js 15 (`15.5.29`, App Router, **100% Pure JavaScript `.jsx`**, zero TypeScript) + Tailwind CSS `3.4.19` + Radix UI Primitives (`Dialog`, `Tabs`, `Slider`, `Drawer/Sheet`, `Select`, `Tooltip`)  
> **Visual Direction:** **Industrial Motorsport / Technical Editorial** — inspired by factory racing spec sheets and precision outdoor hardware (KTM Technical Sheets × Teenage Engineering × Leica Editorial).  
> **Storefront Locale:** Vietnamese default (i18n dictionary ready at `src/lib/i18n/vi.js` and `en.js`).

---

## 1. "Anti-AI-Slop" Design Manifesto

To avoid generic AI-generated e-commerce clichés and cluttered motorcycle dealer templates, all frontend UI strictly enforces these rules:

| Strictly FORBIDDEN (Anti-Patterns) | Mandatory Standard (Industrial Motorsport) |
| :--- | :--- |
| Default purple-blue gradients, dark neon glow (`box-shadow` glow), gimmicky glassmorphism. | High-contrast technical drafting paper canvas (`#F7F7F5`), crisp `1px solid` CAD-style hairline borders, single restrained accent **Signal Dirt Orange `#E84C1E`** (<10% viewport area). |
| Dumping 40+ spec rows in an endless table or cramming 6 widgets into one viewport. | **Progressive Disclosure:** Each screen serves **1 Single Primary Action**; deep mechanical specs live inside structured **Tabs** or a **Slide-over Spec Drawer**. |
| Over-rounded `rounded-3xl` floating cards with heavy blurry drop shadows. | Sharp mechanical radii (`2px – 6px`), clean hairline grids, generous whitespace, and uncluttered side-profile photography. |
| Numbers jittering horizontally while dragging simulator sliders. | All millimeter, weight, cc, percentage, angle (`°`), and VND values MUST use **`JetBrains Mono`** with CSS **`font-variant-numeric: tabular-nums`** for rock-solid 60fps legibility. |

---

## 2. Design Tokens (`globals.css` & `tailwind.config.mjs`)

### 2.1. Color Tokens (WCAG AA+ Contrast)

| Group | CSS Token | Hex | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas / Surface** | `--bg-canvas` | `#F7F7F5` | Primary technical-paper page background |
| | `--bg-surface` | `#FFFFFF` | Product cards, control panels, drawers |
| | `--bg-blueprint` | `#EFEFE9` | 2D Simulator drafting grid surface (optional Dark Blueprint `#14161A` toggle) |
| **Border / Grid** | `--border-subtle` | `#E3E3DC` | Grid hairlines, `1px` card borders |
| | `--border-strong` | `#1C1E21` | Secondary button borders, millimeter axis lines |
| **Typography** | `--text-primary` | `#111214` | Headings, bike titles, primary telemetry (Carbon Ink) |
| | `--text-secondary` | `#52565E` | Secondary descriptions, technical labels |
| | `--text-muted` | `#7C818B` | Units, timestamps, subtle hints |
| **Brand Accent** | `--accent-signal` | `#E84C1E` | Primary CTAs (Reserve/Deposit, Add Bundle), effective seat height line |
| | `--accent-signal-hover` | `#CC3E14` | Primary CTA hover state |
| **Semantic Rider Fit** | `--fit-flat` | `#15803D` | `FLAT_FOOT` — Both feet planted flat |
| | `--fit-balls` | `#B45309` | `BALLS_OF_FEET` — Both balls of feet grounded |
| | `--fit-tiptoe` | `#C2410C` | `TIP_TOE` / `ONE_FOOT_SHIFT` — Toe reach or 1-foot hip shift |
| | `--fit-unsafe` | `#B91C1C` | `TOO_TALL_UNSAFE` / `BOTTOMING_RISK` — Excess height or suspension risk |

### 2.2. Typography (Vietnamese-Native Diacritic Support)

- **Display / Headings:** `Plus Jakarta Sans` (`600`, `700`, `800`, `letter-spacing: -0.025em`)
- **Body / UI Controls:** `Be Vietnam Pro` (`400`, `500`, `600` — engineered for crisp Vietnamese diacritics)
- **Telemetry / Specs / Prices:** `JetBrains Mono` (`500`, `600` + `tabular-nums`)

### 2.3. Spacing & Layout Grid
- Base unit: `4px` (`4, 8, 12, 16, 24, 32, 48, 64, 96`).
- Max container width: `1360px`, horizontal padding `24px` (`16px` mobile).
- Radii: `4px` (`--radius-sm`) for buttons/inputs/badges, `8px` (`--radius-md`) for cards/panels, `0px` inside CAD blueprint frames.

---

## 3. Information Architecture & Sitemap

```text
STOREFRONT (Public & Customer)
├── /                        # Editorial Homepage (Hero + Quick Rider Fit Entry Bar + 3 Terrain Lanes)
├── /bikes                   # Catalog + Dual Filter (Terrain Focus & Rider Fit)
├── /bikes/[slug]            # Bike Detail + Embedded 2D Simulator + Smart Upsell Bundle
├── /compare                 # 2-Bike Ghost Overlay Comparison (Millimeter-Scaled)
├── /accessories             # Parts & Lowering/Protection Gear (filterable by bike compatibility)
├── /test-ride               # Showroom Test Ride Booking (3 showrooms, attaches rider body snapshot)
├── /cart                    # Cart (clearly separates Bike Deposit vs COD-eligible Accessories)
├── /checkout                # Clean 1-Page Checkout (Idempotency-Key, Deposit/Full/COD, PayOS/Mock/VNPay/Stripe)
└── /account                 # Customer Hub
    ├── /account/profile     # Saved Rider Body Profiles (UserBodyProfile)
    ├── /account/orders      # Order & Deposit balance tracking
    └── /account/test-rides  # Scheduled Test Rides

AUTH
├── /login                   # Login (auto-merges Guest Cart)
└── /register                # Registration

ADMIN & SALES PORTAL (RBAC Protected: ADMIN, SALES_STAFF)
├── /admin                   # Operational KPIs (New deposits, Today's test rides, Low stock)
├── /admin/bikes             # Bike CRUD, Pricing, Inventory, Status
├── /admin/bikes/[id]/calibrate  # Admin Calibration Tool (6-anchor UV side-profile placement)
├── /admin/accessories       # Accessories & Compatibility Matrix Manager
├── /admin/orders            # Order Processing & State Machine Transitions
├── /admin/test-rides        # Test Ride Confirmation, Staff Assignment & Requested Setup Specs
├── /admin/users             # User & RBAC Management (ADMIN only)
└── /admin/audit-logs        # Immutable Audit Log Viewer (ADMIN only)
```

---

## 4. Core Screen Layouts & Progressive Disclosure

### 4.1. Homepage (`/`) — *Single Primary Action: Find a bike that fits your body*
- **Minimal Editorial Hero:** Clean side-profile studio photography on technical-paper canvas, concise headline, and a **Quick Fit Bar** (`Height cm` | `Weight kg` | `Terrain` + Signal Orange CTA routing directly to `/bikes` with Rider Fit active).
- **3 Terrain Lanes:** `Pure Off-Road (MX / Enduro)` | `Dual-Sport` | `Adventure & Touring`.
- **Interactive Blueprint Teaser:** Single lightweight slider demonstrating unladen vs. sagged effective seat height.

### 4.2. Bike Catalog (`/bikes`) — *Smart Dual Filter*
- **Collapsible Sticky Rider Fit Strip:** When *"Filter by my body profile"* is toggled on, each `BikeCard` adds **exactly 1 concise technical badge** (never extra charts):
  - e.g., `[● Balls of feet · 825mm effective]` or `[▲ Fits with -30mm Lowering Link]`.
- **Smart Checkbox:** *"Include taller bikes if a compatible lowering kit brings them within reach"*.
- **Clean `BikeCard` Anatomy (5 elements max):** Clean photo → Brand & Model → Terrain badge → 3 monospace metrics (`960mm` · `349cc` · `111kg`) → Price + Deposit line.

### 4.3. Bike Detail (`/bikes/[slug]`) — *3-Tier Progressive Disclosure*
1. **Tier 1 — Above The Fold:** Left (62%): toggle `[Studio Gallery]` ↔ `[2D Rider Fit Blueprint]`. Right (38%): Model, VND Price (`tabular-nums`), Deposit amount, 4 hero specs (`Unladen Seat`, `Effective Seat`, `Wet Weight`, `Engine`), and **1 Primary CTA**: `"Reserve with Deposit"` (+ secondary `"Book Test Ride"`).
2. **Tier 2 — Interactive Rider Fit Workbench:** Full 2D Side-Profile Blueprint on the left + compact slider controls on the right (Height, Weight, Inseam auto/manual, Footwear `Sneakers/ADV/MX`, Stance `Stop Both Feet / Stop 1 Foot / Seated Riding / Standing Attack`), plus **1-Click Mod Switcher** (`+ Lowering Link -30mm`, `+ Low Seat -25mm`, `+ Bar Riser +30mm`) and **Smart Upsell Card** (*"+32 Fit Score · Add Bike + Lowering Kit Bundle"*).
3. **Tier 3 — Deep Mechanical Specs:** Organized **Radix Tabs** (`Geometry & Suspension` | `Engine & Drivetrain` | `Compatible Parts` | `Deposit & Handover Policy`) + `"View Full Spec Sheet"` opening a **Slide-over Drawer**.

### 4.4. Independent Comparison (`/compare`) — *Ghost Overlay*
- Compares any 2 motorcycles around 1 shared rider profile.
- **Ghost Overlay:** Bike A in solid Carbon Ink / Signal Orange; Bike B as a **Blueprint Cyan (`#0284C7`)** translucent overlay with adjustable opacity (20%–100%).
- **Alignment Toggle:** `Rear Axle & Ground` (wheelbase & seat height delta) ↔ `Seat Pocket` (reach to bars & legroom delta).
- Concise **Delta Summary Table** below (`Effective Seat: -55mm`, `Seat Width: -45mm`, `Knee Angle: +8°`, `Wet Weight: -32kg`).

---

## 5. Core Technical Components

### 5.1. `RiderFitSimulator` (`components/simulator/`)
- **60fps Zero-Latency Interaction:** Runs `@dirtfit/ergonomics-engine` synchronously inside `useMemo` (`< 0.4ms`/frame); backend `/api/v1/simulator/evaluate` is called only when switching bikes or refreshing live bundle stock.
- **5-Layer Parametric SVG Canvas:**
  1. `Drafting Grid`: 100mm millimeter grid + left-hand Y-axis ruler (`700, 800, 900, 1000mm`).
  2. `Bike Layer`: Calibrated PNG/WebP side-profile positioned via `calibration.js` (translating downward dynamically by `seatDropFromSagMm + modSeatDropMm`), or automatic fallback to `ParametricWireframeBike.jsx`.
  3. `Reference Lines`: Dashed Unladen Seat line vs. Signal Orange Effective Seat line with sag delta callout (`-62 mm sag`).
  4. `Articulated Rider Figure`: Clean anatomical vector figure (MX helmet, torso, arms, thighs, shins, boots) bound to the 8 `kinematics.js` joint coordinates.
  5. `Telemetry Callouts`: Minimal angle arcs at knee (`88°`), torso (`14°`), and semantic ground-contact highlight at `y = 0`.

### 5.2. `AdminCalibrationTool` (`components/admin/CalibrationCanvas.jsx`)
Enables Admins to calibrate any side-profile photo in `< 60 seconds`:
1. Direct upload to Cloudflare R2 via Presigned PUT.
2. 6-step guided click workflow: `1. Rear Axle` → `2. Front Axle` → `3. Ground Line` → `4. Seat Pocket` → `5. Footpeg` → `6. Handlebar Grip`.
3. **2.5x Magnifying Loupe** following cursor for sub-pixel accuracy.
4. Automatic cross-check: computes `pxPerMm` from `wheelbaseMm` and verifies photo-measured seat height against `unladenSeatHeightMm` (±3%), warning if perspective distortion > 5%.
5. **"Test 175cm Rider Overlay"** button previews the skeleton live before saving.

---

## 6. State Management & API Client Strategy (`apps/web/src/lib/`)

- **Next.js Server Components + ISR (`revalidate: 60`):** Storefront pages (`/`, `/bikes`, `/bikes/[slug]`, `/accessories`) pre-render initial payloads for fast Core Web Vitals and low API wakeups.
- **Minimal Client Stores:** `RiderProfileStore` (React Context + `localStorage` for guests, synced to `/api/v1/users/me/body-profiles` when signed in) and `CartStore` (backed by `/api/v1/cart`).
- **`api-client.js`:**
  - Sends `credentials: 'include'` for `HttpOnly` Refresh Cookies.
  - **Single-Flight Refresh Queue:** On `401 TOKEN_EXPIRED`, executes `/api/v1/auth/refresh` once across concurrent requests and replays queued calls.
  - Parses **RFC 7807** errors into field-level form messages.
  - **Cold-Start Friendly Banner:** Displays a non-blocking progress notice (*"Waking data server..."*) with exponential backoff if Render Free Tier takes >3s on cold start.
