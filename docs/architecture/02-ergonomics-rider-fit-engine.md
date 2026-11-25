# 02. Ergonomics & Rider Fit Engine Specification

> **Package:** `@dirtfit/ergonomics-engine` (Pure JavaScript ESM + JSDoc, Zero External Dependencies)  
> **Purpose:** Provides a physically and geometrically accurate **millimeter-scale (mm)** simulation engine for off-road motorcycles (Motocross, Enduro, Dual-Sport, Adventure), running identically in the Browser (60fps realtime preview) and on the Backend (Smart Filter & Accessory Upsell).

---

## 1. Unified Millimeter Coordinate System

Both the motorcycle chassis and the rider skeleton operate in a unified 2D Cartesian plane from a side-profile view (**default orientation: front of motorcycle faces RIGHT `+X`**, units in **mm**):

- **Origin `(0, 0)`**: Ground contact point directly beneath the **rear axle center** (Rear Tire Ground Contact Point).
- **`+X` Axis (Forward)**: Front axle center sits at `x = wheelbaseMm`.
- **`+Y` Axis (Upward)**: Flat ground plane sits at `y = 0`.

### 6 Core Motorcycle Geometry Anchors (`BikeGeometrySpec`)

Every motorcycle stores 6 core millimeter anchors (measured static/unladen):

| Anchor | Coordinates `(x, y)` | Physical Meaning & Simulation Role |
| :--- | :--- | :--- |
| `rearAxle` | `(0, R_rear)` | Rear axle center (`R_rear` = rear tire outer radius, e.g., 18" rim + knobby tire ≈ 340 mm). |
| `frontAxle` | `(wheelbaseMm, R_front)` | Front axle center (`R_front` = front tire outer radius, e.g., 21" rim + tire ≈ 355 mm). |
| `seatPocket` | `(seatPocketXMm, unladenSeatHeightMm)` | Lowest point of the seat dish where the rider's pelvis settles. |
| `footpeg` | `(footpegXMm, footpegYMm)` | Center of footpeg (foot anchor during seated riding and standing Attack stance). |
| `handlebarGrip` | `(handlebarGripXMm, handlebarGripYMm)` | Center of handlebar grip (wrist anchor). |
| `groundClearance` | `groundClearanceMm` | Minimum chassis/skid-plate clearance (used to warn when installing lowering links). |

---

## 2. Input Data Contracts

### 2.1. Rider Profile (`RiderProfileInput`)

```js
/**
 * @typedef {Object} RiderProfileInput
 * @property {number} heightCm                 - Total height (135..220 cm)
 * @property {number} weightKg                 - Body weight (35..160 kg)
 * @property {number|null} [inseamCm]          - Inseam length (60..115 cm); null = auto-estimated
 * @property {'MALE'|'FEMALE'|'UNSPECIFIED'} gender
 * @property {'SHORT_LEGS'|'AVERAGE'|'LONG_LEGS'} bodyProportion
 * @property {'SNEAKERS'|'ADV_BOOTS'|'MX_BOOTS'} footwear
 * @property {number} [gearWeightKg]           - Riding gear weight (defaults by footwear/focus)
 * @property {'BEGINNER'|'INTERMEDIATE'|'EXPERT'} ridingExperience
 * @property {'ON_ROAD'|'DUAL_SPORT'|'OFF_ROAD'} targetTerrain
 * @property {'SEATED_BOTH_FEET'|'SEATED_ONE_FOOT'|'SEATED_RIDING'|'STANDING_ATTACK'} stanceMode
 */
```

#### Footwear Parameter Matrix (Off-Road Specific)

Motocross boots (`MX_BOOTS`) add substantial sole height, **but their rigid ankle cuff restricts plantarflexion** — a critical real-world detail ignored by generic seat-height calculators:

| `footwear` | `soleThicknessMm` | `ankleFlexLimitDeg` (Max Tip-Toe Flex) | `defaultGearWeightKg` | Real-World Note |
| :--- | :---: | :---: | :---: | :--- |
| `SNEAKERS` | `25 mm` | `35°` | `4 kg` | Easiest to tip-toe, zero off-road ankle protection. |
| `ADV_BOOTS` | `35 mm` | `22°` | `7 kg` | Balanced sole thickness and standing/dabbing mobility. |
| `MX_BOOTS` | `42 mm` | `15°` | `10 kg` | Best static height boost (+42mm), but stiff cuff limits deep tip-toeing; favors balls-of-feet reach or 1-foot hip shift. |

### 2.2. Try-On Modifications (`BikeModificationsInput`)

```js
/**
 * @typedef {Object} BikeModificationsInput
 * @property {number} [loweringLinkMm=0]       - Rear lowering linkage drop (0..50 mm)
 * @property {number} [forkDropMm=0]           - Raising fork tubes in triple clamps to balance rake (0..15 mm)
 * @property {number} [lowSeatMm=0]            - Shaved / OEM low seat drop (0..45 mm)
 * @property {number} [seatWidthReductionMm=0] - Narrowed seat side profile (0..30 mm)
 * @property {number} [barRiserMm=0]           - Handlebar riser height (0..50 mm)
 * @property {number} [barBackOffsetMm=0]      - Handlebar rearward offset (-20..30 mm)
 * @property {number} [pegLowerMm=0]           - Lowered footpegs (0..25 mm)
 * @property {number} [springRateOverrideRatio=1] - Custom spring stiffness multiplier (0.7..1.4)
 */
```

---

## 3. Physics & Analytical Geometry Formulas

### Step 1: Anthropometry & Inseam Estimation (`anthropometry.js`)

When `inseamCm` (crotch-to-barefoot-heel length) is omitted, it is estimated from regression ratios calibrated by gender and leg proportion:

```text
BaseInseam(cm):
  - MALE / UNSPECIFIED: 0.468 × heightCm - 2.1
  - FEMALE:             0.472 × heightCm - 2.6

ProportionMultiplier:
  - SHORT_LEGS: 0.965
  - AVERAGE:    1.000
  - LONG_LEGS:  1.035

estimatedInseamCm = clamp(BaseInseam × ProportionMultiplier, 58, 115)
```

Segment lengths in `mm` (referenced from Drillis & Contini, normalized to total height `H = heightCm × 10` and `I = inseamCm × 10`):

- `thighLenMm = 0.53 × I` (hip joint center → knee joint center)
- `shinLenMm = 0.47 × I` (knee joint center → ankle center)
- `ankleHeightMm = 0.042 × H` (ankle center → barefoot sole)
- `footLengthMm = 0.152 × H`
- `ankleToBallMm = 0.68 × footLengthMm` (ankle → ball of foot)
- `ankleToToeMm = 0.90 × footLengthMm` (ankle → toe tip)
- `torsoLenMm = 0.300 × H + (0.455 × H - I) × 0.45` (compensates torso length for shorter/longer leg ratios)
- `upperArmLenMm = 0.186 × H`
- `forearmPlusHandMm = 0.186 × H`
- `hipHalfWidthMm = 0.049 × H` (~85 mm for a 173 cm rider)

---

### Step 2: Static Sag, Rider Sag & Effective Seat Height (`sag.js`)

Dirtbikes and Adventure bikes feature long-travel suspension (`200–310 mm`), so **Effective Seat Height** under rider load is substantially lower than the manufacturer's unladen spec (`unladenSeatHeightMm`).

#### Inputs from `BikeGeometrySpec`:
- `rearTravelMm`, `frontTravelMm`
- `staticSagRearMm` (typically ~`0.11 × rearTravelMm`), `staticSagFrontMm` (~`0.09 × frontTravelMm`)
- `targetRiderSagRatio` (MX/Enduro = `0.33`, Dual-Sport = `0.35`, ADV = `0.30`)
- `referenceRiderWeightKg` (OEM spring design load, default `75 kg` rider + `8 kg` gear = `83 kg`)
- `linkageProgressionAlpha` (rising-rate Pro-Link/Unitrack = `0.85`, KTM PDS = `0.88`, linear Dual-Sport = `0.95`)

#### Formulas:
1. Total geared rider mass:
   $$M_{\text{total}} = \text{weightKg} + \text{gearWeightKg}$$

2. Additional rear sag under rider load (scaled by spring override $k_{\text{mod}}$):
   $$\text{baseAdditionalRearSag} = \text{rearTravelMm} \times \text{targetRiderSagRatio} - \text{staticSagRearMm}$$
   $$\Delta \text{sag}_{\text{rear}} = \frac{\text{baseAdditionalRearSag}}{k_{\text{mod}}} \times \left(\frac{M_{\text{total}}}{M_{\text{ref}}}\right)^{\alpha}$$

3. Clamped total rear rider sag (protects against exceeding physical bump-stop limits):
   $$\text{totalRearSagMm} = \text{clamp}(\text{staticSagRearMm} + \Delta \text{sag}_{\text{rear}},\; \text{staticSagRearMm} + 10,\; 0.52 \times \text{rearTravelMm})$$
   $$\text{sagPercentOfTravel} = \frac{\text{totalRearSagMm}}{\text{rearTravelMm}} \times 100\%$$

4. Suspension spring match classification (`sagStatus`):
   - `< 26%`: `TOO_STIFF` (Light rider on stiff OEM spring → bike rides high with reduced traction; suggests softer spring).
   - `26% – 37%`: `OPTIMAL` (Ideal operating sag window).
   - `37% – 45%`: `SOFT` (Deeper sag, comfortable on tarmac but risks bottoming on aggressive off-road hits).
   - `> 45%`: `BOTTOMING_RISK` (Red warning: increase preload or upgrade to heavier spring rate).

5. Front fork sag (seated weight distribution puts ~35–42% load forward):
   $$\Delta \text{sag}_{\text{front}} = \text{clamp}\left(\frac{0.15 \times \text{frontTravelMm}}{k_{\text{mod}}} \times \left(\frac{M_{\text{total}}}{M_{\text{ref}}}\right)^{0.90},\; 8,\; 0.35 \times \text{frontTravelMm}\right)$$

6. Linear chassis interpolation at the seat pocket (`t_seat = seatPocketXMm / wheelbaseMm`, typically ~`0.38`):
   $$\text{seatDropFromSagMm} = (1 - t_{\text{seat}}) \times (\text{totalRearSagMm} - \text{staticSagRearMm}) + t_{\text{seat}} \times \Delta \text{sag}_{\text{front}}$$

7. Seat foam compression (`seatFoamCompressionMm`):
   - `FIRM` (MX): `clamp(4 + 0.04 × M_total, 4, 9)` mm
   - `MEDIUM` (Dual-Sport): `clamp(6 + 0.07 × M_total, 6, 14)` mm
   - `PLUSH` (Adventure): `clamp(8 + 0.10 × M_total, 8, 19)` mm

8. **Effective Seat Height (`effectiveSeatHeightMm`)**:
   $$\text{modSeatDropMm} = \text{lowSeatMm} + (1 - t_{\text{seat}}) \times \text{loweringLinkMm} + t_{\text{seat}} \times \text{forkDropMm}$$
   $$\text{effectiveSeatHeightMm} = \text{unladenSeatHeightMm} - \text{seatDropFromSagMm} - \text{seatFoamCompressionMm} - \text{modSeatDropMm}$$

---

### Step 3: Seat Width Factor & Ground Contact Classification (`foot-contact.js`)

Two motorcycles with identical `effectiveSeatHeightMm = 820 mm` behave completely differently if one has a **230 mm wide Adventure saddle** vs. a **145 mm slim Enduro seat**:
1. Thighs splay outward wrapping around wide seat edges (**Seat Edge Wrap Loss**).
2. Feet must be planted wider laterally to clear footpegs and engine cases (**Lateral Stance Triangle**).

#### Formulas:
1. Effective seat width after shaved-seat modifications:
   $$W_{\text{eff}} = \max(125,\; \text{seatWidthMm} - \text{seatWidthReductionMm})$$

2. Inseam loss from wrapping over seat edges:
   $$\text{wrapLossMm} = \max(0,\; (W_{\text{eff}} - 140) \times 0.22)$$

3. Lateral foot plant offset from chassis centerline:
   $$S_{\text{lat}} = \max(150,\; 0.65 \times W_{\text{eff}} + 65)$$
   $$d_x = \max(0,\; S_{\text{lat}} - \text{hipHalfWidthMm})$$

4. Maximum vertical reach to plant **both feet flat (heels down)**:
   $$L_{\text{avail}} = (\text{inseamCm} \times 10) + \text{soleThicknessMm} - \text{wrapLossMm}$$
   $$H_{\text{flat}} = \sqrt{\max(0,\; L_{\text{avail}}^2 - d_x^2)}$$

5. Vertical height deficit ($\Delta H$):
   $$\Delta H = \text{effectiveSeatHeightMm} - H_{\text{flat}}$$

6. Ankle extension reach (governed by `ankleFlexLimitDeg`):
   - **Balls of Feet reach:**
     $$G_{\text{ball}} = \text{ankleToBallMm} \times \sin(\text{ankleFlexLimitDeg})$$
   - **Tip-Toe maximum reach:**
     $$G_{\text{toe}} = \text{ankleToToeMm} \times \sin(\min(50°,\; \text{ankleFlexLimitDeg} + 10°))$$
   - **One-Foot Hip Shift bonus:**
     $$B_{\text{oneFoot}} = 78\text{ mm} + \max(0,\; (W_{\text{eff}} - 160) \times 0.15)$$
     *(Shifting one buttock off the seat eliminates lateral splay $d_x$ and drops the hip ~75–90 mm).*

#### Ground Contact Classification & Foot Contact Percentage

| Condition on $\Delta H$ | `contactStatus` | `footContactPercent` (2-Foot) | Rider Interpretation |
| :--- | :--- | :---: | :--- |
| $\Delta H \le 0$ | `FLAT_FOOT` | `100%` | Both feet planted flat with heels down and relaxed knee bend. |
| $0 < \Delta H \le G_{\text{ball}}$ | `BALLS_OF_FEET` | `45% – 95%` (linear) | Both balls of feet firmly on ground; confident stop-and-go control. |
| $G_{\text{ball}} < \Delta H \le G_{\text{toe}}$ | `TIP_TOE` | `15% – 44%` | Both toes touching; vulnerable on off-camber trails/slopes; consider lowering kit for beginners. |
| $G_{\text{toe}} < \Delta H \le G_{\text{toe}} + B_{\text{oneFoot}}$ | `ONE_FOOT_SHIFT` | `0%` (2-foot) / separate `oneFootStatus` | Cannot touch both feet simultaneously; requires shifting hip to plant one strong foot (standard for experienced Enduro riders). |
| $\Delta H > G_{\text{toe}} + B_{\text{oneFoot}}$ | `TOO_TALL_UNSAFE` | `0%` | Too tall even with 1-foot shift; **strongly recommends Lowering Link + Low Seat bundle or a lower chassis**. |

---

### Step 4: Rider Triangle & 2D Analytical Inverse Kinematics (`kinematics.js`)

Solves exact `(x, y)` coordinates for all 8 joints (`ankle`, `knee`, `hip`, `shoulder`, `elbow`, `wrist`, `headCenter`, `footContact`) in two riding stances:

#### 4.1. Seated Riding Stance (On-Road / Trail Cruising)
1. **Hip (`hip`)**: `(seatPocketX - 35, effectiveSeatHeightMm + 82)`.
2. **Ankle (`ankle`)**: `(footpegX, footpegY - pegLowerMm + soleThicknessMm + 20)`.
3. **Knee (`knee`) via 2-Bone Analytical IK (Law of Cosines)**:
   - Given distance $D = \|\text{hip} - \text{ankle}\|$, thigh $L_1 = \text{thighLenMm}$, shin $L_2 = \text{shinLenMm}$.
   - Clamp $D \le (L_1 + L_2) \times 0.995$ to guarantee `Math.acos` stays safely inside $[-1, 1]$ (zero `NaN`).
   - Internal knee angle:
     $$\theta_{\text{knee}} = \arccos\left(\frac{L_1^2 + L_2^2 - D^2}{2 L_1 L_2}\right)$$
   - Select the forward-facing solution (`+X` toward fuel tank/bars).
4. **Wrist (`wrist`)**: `(handlebarGripX - barBackOffsetMm, handlebarGripY + barRiserMm)`.
5. **Torso Lean (`torsoLeanDeg`) & Shoulder (`shoulder`)**:
   - Place `shoulder` on the circle of radius `torsoLenMm` centered at `hip` to achieve natural shock-absorbing arm reach `targetArmReach = 0.88 × (upperArm + forearm)` (~`145°–155°` elbow angle).
   - If upright (`0°`) exceeds `targetArmReach`, lean torso forward up to `55°` max (flagging over-reach above `40°` for ADV/Enduro).
6. **Elbow (`elbow`) via 2-Bone Analytical IK** (downward/rearward solution).
7. **Output Ergonomic Metrics**:
   - `kneeAngleDeg`: Ideal `80°–105°`; `< 72°` warns of cramped knees on long tours.
   - `torsoLeanDeg`: `0°–18°` (Upright Adventure/Dual-Sport), `19°–32°` (Active sporty lean), `> 35°` (Upper-body fatigue risk).
   - `hipAngleDeg`: Torso-to-thigh angle (`> 75°` comfortable).
   - `elbowAngleDeg`: `135°–160°` optimal impact absorption.

#### 4.2. Standing Off-Road Attack Position (`STANDING_ATTACK`)
Crucial for off-road capability: tall riders (>180 cm) often fit comfortably seated, yet suffer severe back hunching when standing due to low OEM bars.
1. Feet planted on `footpeg` (`ankle` anchored on peg).
2. Athletic knee bend (`kneeAngleDeg = 152°`, slight `8°` forward shin angle) → determines `knee` and `hip` (hips hinged rearward).
3. Solve `shoulder` and elevated motocross elbows (`elbowAngleDeg ≈ 125°–140°`, "Elbows Up") toward `wrist`.
4. **Metric `standingTorsoLeanDeg`**:
   - `25° – 45°`: Balanced Off-Road Attack posture.
   - `> 50°`: **Hunched Standing Stance warning** → Engine automatically calculates the exact **Bar Riser (`recommendedBarRiserMm`)** height (`20 / 30 / 40 mm`) needed to restore `< 45°` torso lean.

---

## 4. Image Calibration Data Contract (`CalibrationData`)

To align transparent side-profile motorcycle photos (`SIDE_PROFILE_BLUEPRINT`) accurately to millimeter scale and power **Ghost Overlay**, Admins calibrate 6 anchor points once, stored in `BikeMedia.calibrationData` (JSONB):

```json
{
  "version": 1,
  "facing": "RIGHT",
  "imageWidthPx": 1600,
  "imageHeightPx": 1000,
  "anchorsUv": {
    "rearAxle": { "u": 0.215, "v": 0.728 },
    "frontAxle": { "u": 0.785, "v": 0.721 },
    "groundLineV": 0.912,
    "seatPocket": { "u": 0.438, "v": 0.382 },
    "footpeg": { "u": 0.452, "v": 0.710 },
    "handlebarGrip": { "u": 0.635, "v": 0.278 }
  },
  "derived": {
    "pxPerMm": 0.6124,
    "rollCorrectionDeg": -0.35
  }
}
```

### World ↔ SVG Projection Rules (`calibration.js`)
1. Compute pixel axle span `axleSpanPx` between `rearAxle` and `frontAxle`.
2. Normalize scale: `pxPerMm = axleSpanPx / bike.wheelbaseMm`.
3. Map any millimeter point `(xMm, yMm)` to SVG canvas space anchored at `(rearAxlePx.x, groundLinePx.y)`:
   - `svgX = originX + xMm * scale`
   - `svgY = originY - yMm * scale`
4. **Ghost Overlay Mode (Bike A vs. Bike B)**:
   - Both transparent photos are scaled to the **same shared `pxPerMm`** using each motorcycle's real `wheelbaseMm` (a larger ADV physically dwarfs a 150cc dual-sport accurately).
   - Supports two alignment modes (`alignmentMode`):
     - `REAR_AXLE_GROUND` (default): Locks shared ground `y = 0` and rear axle `x = 0` to compare wheelbase and seat height.
     - `SEAT_POCKET`: Locks the saddle pockets together to compare reach to bars and legroom to pegs.

---

## 5. Fit Score (0–100) & Smart Upsell Engine (`scoring.js`)

### `fitScore` Weighting
Weights adapt automatically to `ridingExperience` and `targetTerrain`:
- `BEGINNER` or `ON_ROAD`: prioritizes secure ground reach (**60% Foot Contact**, 25% Seated Ergo, 5% Standing Ergo, 10% Suspension Match).
- `EXPERT` + `OFF_ROAD`: tolerates 1-foot shifts on tall Enduro bikes (**30% Foot Contact**, 20% Seated Ergo, 35% Standing Attack Ergo, 15% Suspension Match).

### Automated Smart Upsell Flow
When `evaluateBikeFit(rider, bike, compatibleAccessories)` runs:
1. If `contactStatus` ∈ `{ TIP_TOE, ONE_FOOT_SHIFT, TOO_TALL_UNSAFE }`:
   - Filters compatible `LOWERING_LINK` and `LOW_SEAT` accessories.
   - Simulates individual parts and combined kits.
   - Returns `upsellSuggestions[]` with exact `beforeSeatHeightMm` → `afterSeatHeightMm`, `beforeStatus` → `afterStatus`, `fitScoreGain` (e.g., `+28 pts`), and transparent engineering notices (e.g., *"Lowering 30mm reduces ground clearance by ~25mm and requires raising fork tubes 10mm in the clamps to preserve steering geometry."*).
2. If `standingTorsoLeanDeg > 50°`: recommends compatible `BAR_RISER` accessories.
3. If `sagStatus` is `TOO_STIFF` or `BOTTOMING_RISK`: recommends weight-matched `SHOCK_SPRING` options.

---

## 6. Mandatory Edge Cases (Unit Test Coverage ≥ 95%)

| Edge Case | Engine Behavior in `@dirtfit/ergonomics-engine` |
| :--- | :--- |
| Ultra-light rider (40 kg) on heavy ADV | Clamps `totalRearSagMm >= staticSagRearMm + 10`; sets `sagStatus = 'TOO_STIFF'` + suggests softer spring/preload reduction. |
| Heavy rider (140 kg + 12 kg gear) on soft Dual-Sport | Clamps sag at `52%` travel (bump-stop limit); sets `BOTTOMING_RISK`; never produces negative or unrealistic `effectiveSeatHeightMm`. |
| Short rider (145 cm) on 960 mm Motocrosser | Zero `NaN` errors in `Math.sqrt` / `Math.acos`; returns `TOO_TALL_UNSAFE`, `footContactPercent = 0`, triggers lowering bundle & lower-bike recommendations. |
| Tall rider (205 cm) on compact Dual-Sport | `ΔH < 0` → `FLAT_FOOT (100%)`, warns `CRAMPED_KNEES` if `kneeAngleDeg < 72°`, suggests `FOOTPEG_LOWER` & tall seat. |
| Missing `calibrationData` (`null`) | Automatically falls back to **Parametric Wireframe Blueprint SVG** generated purely from the 6 millimeter anchors (accurate wheel diameters, `rakeDeg` forks, swingarm, seat, bars). |
| Excessive lowering drops ground clearance < 200 mm | Emits `LOW_GROUND_CLEARANCE_WARNING` flag for honest off-road guidance. |
| Golden Real-World Benchmarks | `real-world-bikes.test.js` asserts effective seat height predictions within `±8mm` across **KTM 350 EXC-F**, **Honda CRF300L**, and **Yamaha Ténéré 700**. |

---

## 7. v2.0 Expansion Delta — Live Grounding cho AI Support Chatbot

Từ `v2.0` (Phase 11), `evaluateBikeFit()` trong `@dirtfit/ergonomics-engine` tiếp tục giữ nguyên trạng thái **0 external dependencies** và được `apps/api/src/modules/chatbot/chatbot.grounding.js` gọi trực tiếp phía server khi người dùng hỏi tư vấn chọn xe theo vóc dáng (`heightCm`, `weightKg`, `inseamCm`, `footwear`). Kết quả thật (`effectiveSeatHeightMm`, `riderSagMm`, `contactStatus`, `fitScore`, `upsellSuggestions`) được tiêm vào ngữ cảnh LLM và trả về dạng structured `recommendedBikes[]` cho UI Chatbot — bảo đảm **zero hallucination** cho mọi con số công thái học. Xem chi tiết tại [09-ai-chatbot-knowledge-prompts.md](./09-ai-chatbot-knowledge-prompts.md).
