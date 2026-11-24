/**
 * @typedef {object} Point2D
 * @property {number} x - Horizontal coordinate in mm (+X points forward toward front wheel)
 * @property {number} y - Vertical coordinate in mm (+Y points upward from flat ground y=0)
 */

/**
 * @typedef {object} RiderProfileInput
 * @property {number} heightCm - Total standing height in cm (135..220)
 * @property {number} weightKg - Body weight in kg (35..160)
 * @property {number|null} [inseamCm] - Barefoot inseam length in cm (58..115); null = auto-estimated
 * @property {'MALE'|'FEMALE'|'UNSPECIFIED'} [gender='UNSPECIFIED'] - Rider gender for anthropometry estimation
 * @property {'SHORT_LEGS'|'AVERAGE'|'LONG_LEGS'} [bodyProportion='AVERAGE'] - Leg-to-torso ratio profile
 * @property {'SNEAKERS'|'ADV_BOOTS'|'MX_BOOTS'} [footwear='ADV_BOOTS'] - Riding footwear profile
 * @property {number} [gearWeightKg] - Riding gear mass in kg (defaults by footwear)
 * @property {'BEGINNER'|'INTERMEDIATE'|'EXPERT'} [ridingExperience='INTERMEDIATE'] - Experience weighting
 * @property {'ON_ROAD'|'DUAL_SPORT'|'OFF_ROAD'} [targetTerrain='DUAL_SPORT'] - Primary riding terrain
 * @property {'SEATED_BOTH_FEET'|'SEATED_ONE_FOOT'|'SEATED_RIDING'|'STANDING_ATTACK'} [stanceMode='SEATED_BOTH_FEET'] - Active stance
 */

/**
 * @typedef {object} BikeGeometryInput
 * @property {string} [id] - Optional motorcycle identifier
 * @property {string} [name] - Optional motorcycle display name
 * @property {number} unladenSeatHeightMm - Manufacturer static seat height in mm
 * @property {number} seatWidthMm - Seat saddle width at rider contact zone in mm
 * @property {number} wheelbaseMm - Axle-to-axle wheelbase in mm
 * @property {number} groundClearanceMm - Minimum unladen chassis ground clearance in mm
 * @property {number} frontWheelDiameterIn - Front rim diameter in inches
 * @property {number} rearWheelDiameterIn - Rear rim diameter in inches
 * @property {number} frontTireOuterRadiusMm - Front tire outer radius in mm
 * @property {number} rearTireOuterRadiusMm - Rear tire outer radius in mm
 * @property {number} frontTravelMm - Front fork travel in mm
 * @property {number} rearTravelMm - Rear shock wheel travel in mm
 * @property {number} staticSagRearMm - Static rear sag under bike weight only in mm
 * @property {number} staticSagFrontMm - Static front sag under bike weight only in mm
 * @property {number} [targetRiderSagRatio=0.33] - Target rear rider sag ratio (0.28..0.38)
 * @property {number} [referenceRiderWeightKg=83] - OEM spring reference geared mass in kg
 * @property {number} [linkageProgressionAlpha=0.85] - Nonlinear linkage progression exponent
 * @property {'FIRM'|'MEDIUM'|'PLUSH'} [seatFoamFirmness='MEDIUM'] - Seat foam density
 * @property {number} seatPocketXMm - Seat pocket X coordinate from rear contact origin in mm
 * @property {number} seatPocketYMm - Seat pocket Y coordinate in mm
 * @property {number} footpegXMm - Footpeg center X coordinate in mm
 * @property {number} footpegYMm - Footpeg center Y coordinate in mm
 * @property {number} handlebarGripXMm - Handlebar grip X coordinate in mm
 * @property {number} handlebarGripYMm - Handlebar grip Y coordinate in mm
 * @property {number} [rakeDeg=27] - Steering head rake angle in degrees
 * @property {number} [wetWeightKg=140] - Wet weight in kg
 * @property {object|null} [calibrationData] - Optional calibrated UV blueprint data
 */

/**
 * @typedef {object} BikeModificationsInput
 * @property {number} [loweringLinkMm=0] - Rear lowering linkage drop in mm (0..50)
 * @property {number} [forkDropMm=0] - Fork tube raise in triple clamps in mm (0..15)
 * @property {number} [lowSeatMm=0] - Shaved or OEM low seat drop in mm (0..45)
 * @property {number} [seatWidthReductionMm=0] - Seat side-edge shave reduction in mm (0..30)
 * @property {number} [barRiserMm=0] - Handlebar riser height in mm (0..50)
 * @property {number} [barBackOffsetMm=0] - Handlebar rearward offset in mm (-20..30)
 * @property {number} [pegLowerMm=0] - Footpeg lowering offset in mm (0..25)
 * @property {number} [springRateOverrideRatio=1] - Custom spring rate multiplier (0.7..1.4)
 */

/**
 * @typedef {object} AnthropometryResult
 * @property {number} heightMm - Total rider height in mm
 * @property {number} inseamMm - Effective barefoot inseam in mm
 * @property {number} inseamCm - Effective barefoot inseam in cm
 * @property {boolean} isInseamEstimated - True if inseam was auto-estimated
 * @property {number} thighLenMm - Hip-to-knee length in mm
 * @property {number} shinLenMm - Knee-to-ankle length in mm
 * @property {number} ankleHeightMm - Ankle-to-barefoot-sole height in mm
 * @property {number} footLengthMm - Total foot length in mm
 * @property {number} ankleToBallMm - Ankle-to-ball-of-foot lever arm in mm
 * @property {number} ankleToToeMm - Ankle-to-toe-tip lever arm in mm
 * @property {number} torsoLenMm - Hip-to-shoulder torso length in mm
 * @property {number} upperArmLenMm - Shoulder-to-elbow length in mm
 * @property {number} forearmPlusHandMm - Elbow-to-grip center length in mm
 * @property {number} hipHalfWidthMm - Lateral half-width of hip joints in mm
 */

/**
 * @typedef {object} SagResult
 * @property {number} totalRiderMassKg - Geared rider weight in kg
 * @property {number} additionalRearSagMm - Rear suspension sag added by rider in mm
 * @property {number} totalRearSagMm - Static + rider rear sag in mm
 * @property {number} additionalFrontSagMm - Front suspension sag added by rider in mm
 * @property {number} totalFrontSagMm - Static + rider front sag in mm
 * @property {number} sagPercentOfTravel - Total rear sag as percentage of rear travel
 * @property {'TOO_STIFF'|'OPTIMAL'|'SOFT'|'BOTTOMING_RISK'} sagStatus - Spring rate classification
 * @property {boolean} isSagClampedMin - True if minimum rider sag clamp triggered
 * @property {boolean} isSagClampedMax - True if bump-stop max sag clamp triggered
 * @property {number} seatDropFromSagMm - Seat vertical drop from suspension sag in mm
 * @property {number} seatFoamCompressionMm - Seat vertical drop from foam compression in mm
 * @property {number} modSeatDropMm - Seat vertical drop from lowering link / low seat / fork drop in mm
 * @property {number} effectiveSeatHeightMm - Final effective seat height under rider load in mm
 * @property {number} effectiveGroundClearanceMm - Ground clearance after lowering link in mm
 * @property {string[]} warnings - Suspension and geometry warnings
 */

/**
 * @typedef {object} FootContactResult
 * @property {number} effectiveSeatWidthMm - Seat width after shave mods in mm
 * @property {number} wrapLossMm - Inseam loss caused by thigh wrap around seat edges in mm
 * @property {number} lateralFootOffsetMm - Lateral foot plant distance from centerline in mm
 * @property {number} availableLegLengthMm - Effective leg + boot sole reach after wrap loss in mm
 * @property {number} flatFootReachMm - Vertical reach for flat-foot stance in mm
 * @property {number} heightDeficitMm - Vertical gap (effectiveSeatHeight - flatFootReach) in mm
 * @property {'FLAT_FOOT'|'BALLS_OF_FEET'|'TIP_TOE'|'ONE_FOOT_SHIFT'|'TOO_TALL_UNSAFE'} contactStatus - Two-foot contact classification
 * @property {number} footContactPercent - Percentage of foot length contacting ground (both feet)
 * @property {number} ankleAngleDeg - Required ankle extension angle in degrees
 * @property {number} kneeBendAtStopDeg - Relaxed knee bend angle when flat-footed in degrees
 * @property {'FLAT_FOOT'|'BALLS_OF_FEET'|'TIP_TOE'|'TOO_TALL_UNSAFE'} oneFootContactStatus - Ground contact when shifting one hip off seat
 * @property {number} oneFootContactPercent - Percentage of foot length contacting ground on 1-foot shift
 */

/**
 * @typedef {object} KinematicsStanceResult
 * @property {object} joints - Solved 2D joint coordinates in mm
 * @property {number} kneeAngleDeg - Internal knee flexion angle in degrees
 * @property {number} hipAngleDeg - Torso-to-thigh angle in degrees
 * @property {number} torsoLeanDeg - Forward torso lean from vertical in degrees
 * @property {number} elbowAngleDeg - Internal elbow flexion angle in degrees
 * @property {string[]} warnings - Posture warnings
 */

/**
 * @typedef {object} CompatibleAccessoryInput
 * @property {string} id - Accessory UUID
 * @property {string} name - Accessory display name
 * @property {string} category - AccessoryCategory enum value
 * @property {number} priceVnd - Price in safe integer VND
 * @property {number} [installLaborVnd=0] - Workshop labor fee in safe integer VND
 * @property {number} [stockQty=0] - Available stock quantity
 * @property {object} [ergoImpact] - Ergonomic impact parameters
 */

/**
 * @typedef {object} UpsellSuggestion
 * @property {string} type - Suggestion kind (SINGLE_PART, LOWERING_BUNDLE, BAR_RISER, SHOCK_SPRING)
 * @property {string} title - Short suggestion title
 * @property {string[]} accessoryIds - Recommended accessory IDs
 * @property {number} beforeSeatHeightMm - Effective seat height before mods
 * @property {number} afterSeatHeightMm - Effective seat height after mods
 * @property {string} beforeContactStatus - Ground contact status before mods
 * @property {string} afterContactStatus - Ground contact status after mods
 * @property {number} fitScoreGain - Improvement in Fit Score points
 * @property {number} estimatedTotalCostVnd - Total accessory + labor cost in VND
 * @property {string[]} technicalNotes - Honest mechanical trade-off notes
 */

export const TYPES_LOADED = true;
