---
id: rider-fit-faq-en
slug: rider-fit-faq
locale: en
kicker: ERGONOMICS ENGINEERING FAQ
title: Rider-Fit Physics & Lowering FAQ
summary: Technical guide explaining Static Sag vs Rider Sag, Seat Width Wrap Loss, the 5 foot-contact statuses, and how boots, lowering links, and low seats combine in the 2D Simulator.
publicPath: /policies/rider-fit
version: 2.0.0
lastUpdated: 2026-11-25
---

Off-road motorcycles have 210–313mm of long-travel suspension, meaning specification-sheet "unladen seat height" never equals the true height you experience at a stoplight or trailhead.

## [sag-and-effective-seat] Static Sag, Rider Sag & Effective Seat Height

- **Unladen Seat Height (`unladenSeatHeightMm`):** Measured vertically with the motorcycle completely unloaded (0 kg on the saddle). For example, a KTM 350 EXC-F measures **963mm** unladen.
- **Static Sag:** How much the bike settles under its own wet weight (~22–36mm on dirtbikes).
- **Rider Sag (`riderSagMm`):** Additional suspension compression under your body weight plus riding gear (`gearWeightKg`, defaulting to 10 kg with MX Boots).
- **Progressive Linkage Physics:** `@dirtfit/ergonomics-engine` uses the bike's `linkageProgressionAlpha`, `referenceRiderWeightKg`, and seat foam compression (`FIRM`/`MEDIUM`/`PLUSH`) to compute **Effective Seat Height** (`effectiveSeatHeightMm`).
- **Sag Status Thresholds:**
  - `< 26%` rear travel → `TOO_STIFF` (spring is too heavy for rider weight; minimal sag drop).
  - `26% – 37%` rear travel → **`OPTIMAL`** (balanced traction & chassis geometry).
  - `37% – 45%` rear travel → `SOFT` (recommends preload increase or stiffer spring).
  - `> 45%` rear travel (clamped at `52%` bump-stop) → `BOTTOMING_RISK`.

## [seat-width-wrap-loss] Why Wide Seats Feel Taller (Seat Width Wrap Loss)

Two bikes with the exact same **880mm** seat height can feel completely different at standstill:

- A slim competition Enduro (`145mm` saddle width) lets your inner thighs drop straight downward.
- A wide Adventure twin like the **Yamaha Ténéré 700** (`220mm` saddle width, `875mm` unladen seat) forces your legs outward around the seat edges, consuming usable inseam length (**Seat Width Wrap Loss**).
- The 2D Engine automatically deducts wrap loss above the `150mm` baseline (`wrapLossMm = max(0, (seatWidthMm - 150) * 0.35)`) before evaluating ground contact.

## [foot-contact-levels] Understanding the 5 Foot-Contact Statuses

After calculating usable leg reach (`effectiveInseam + bootSoleHeight - wrapLoss`) versus `effectiveSeatHeightMm`, DirtFit classifies your standstill stability:

1. **`FLAT_FOOT`:** Both heels plant flat on the ground (`100%` stability — ideal for beginners and steep off-camber stops).
2. **`BALLS_OF_FEET`:** Both balls of the feet press firmly onto the ground (target sweet spot for most off-road riders on tall Enduro/Dual-Sport chassis).
3. **`TIP_TOE`:** Only toes touch with both legs down; controllable on smooth surfaces, fatiguing on ruts.
4. **`ONE_FOOT_SHIFT`:** Shifting one hip off the saddle plants one full foot firmly on the trail while keeping the rear brake covered — standard pro Enduro technique.
5. **`TOO_TALL_UNSAFE`:** Insufficient reach even with hip shift; **strongly recommends a Lowering Link + Low Seat combo or a lower-chassis model** (such as Honda CRF150L or CRF300L).

## [lowering-and-boots] How Boots, Lowering Links & Low Seats Work Together

- **Footwear Boost:** Switching from `SNEAKERS` (`+25mm` sole, high ankle flex) to **`ADV_BOOTS`** (`+35mm`) or **`MX_BOOTS`** (`+42mm`) immediately adds up to `17mm` of pure ground reach per leg while protecting ankles.
- **Lowering Link (`-25mm` to `-30mm`):** Changes the rear shock linkage ratio to drop seat height cleanly. DirtFit reminds riders to pair a `-30mm` link with a **`10mm` front fork drop** in the triple clamps to preserve OEM rake/trail steering stability and warns if ground clearance falls below `200mm`.
- **Low Seat (`-20mm` to `-25mm`):** Shaves saddle foam and narrows the front waist (`seatWidthReductionMm`), preserving full suspension travel and ground clearance!
- **Bar Riser (`+30mm`):** Recommended automatically by the simulator when **Standing Attack** posture shows `standingTorsoLeanDeg > 50°` for taller riders (> 180 cm).
