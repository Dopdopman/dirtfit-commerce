import { computeAnthropometry } from './anthropometry.js';
import { CONTACT_STATUSES, SAG_STATUSES, clamp, roundTo } from './constants.js';
import { calculateFootContact } from './foot-contact.js';
import { calculateRiderKinematics } from './kinematics.js';
import { calculateSuspensionSag, normalizeModifications } from './sag.js';

/** @typedef {import('./types.js').RiderProfileInput} RiderProfileInput */
/** @typedef {import('./types.js').BikeGeometryInput} BikeGeometryInput */
/** @typedef {import('./types.js').BikeModificationsInput} BikeModificationsInput */
/** @typedef {import('./types.js').CompatibleAccessoryInput} CompatibleAccessoryInput */
/** @typedef {import('./types.js').UpsellSuggestion} UpsellSuggestion */

const SAG_SCORES = Object.freeze({
  OPTIMAL: 100,
  SOFT: 76,
  TOO_STIFF: 68,
  BOTTOMING_RISK: 35,
});

/**
 * Resolve scoring weights tailored to rider experience and intended terrain.
 * @param {RiderProfileInput} rider
 * @returns {{ contact: number, seated: number, standing: number, sag: number }}
 */
function resolveWeights(rider) {
  const experience = rider.ridingExperience ?? 'INTERMEDIATE';
  const terrain = rider.targetTerrain ?? 'DUAL_SPORT';

  if (experience === 'BEGINNER' || terrain === 'ON_ROAD') {
    return { contact: 0.6, seated: 0.25, standing: 0.05, sag: 0.1 };
  }
  if (experience === 'EXPERT' && terrain === 'OFF_ROAD') {
    return { contact: 0.3, seated: 0.2, standing: 0.35, sag: 0.15 };
  }
  return { contact: 0.45, seated: 0.25, standing: 0.18, sag: 0.12 };
}

/**
 * Score foot contact sub-metric (0..100), rewarding continuous contact percentage improvements.
 * @param {object} footContact
 * @param {RiderProfileInput} rider
 * @returns {number}
 */
function scoreFootContact(footContact, rider) {
  switch (footContact.contactStatus) {
    case CONTACT_STATUSES.FLAT_FOOT:
      return 100;
    case CONTACT_STATUSES.BALLS_OF_FEET:
      return 78 + (footContact.footContactPercent / 100) * 18;
    case CONTACT_STATUSES.TIP_TOE:
      return 50 + (footContact.footContactPercent / 100) * 20;
    case CONTACT_STATUSES.ONE_FOOT_SHIFT: {
      let score = 28 + (footContact.oneFootContactPercent / 100) * 28;
      if (
        rider.ridingExperience === 'EXPERT' &&
        (footContact.oneFootContactStatus === CONTACT_STATUSES.FLAT_FOOT ||
          footContact.oneFootContactStatus === CONTACT_STATUSES.BALLS_OF_FEET)
      ) {
        score += 18;
      }
      return clamp(score, 28, 76);
    }
    default:
      return 8;
  }
}

/**
 * Score seated cruising ergonomics (0..100).
 * @param {object} seated
 * @returns {number}
 */
function scoreSeatedErgo(seated) {
  let score = 100;
  if (seated.kneeAngleDeg < 80) {
    score -= (80 - seated.kneeAngleDeg) * 2.4;
  } else if (seated.kneeAngleDeg > 115) {
    score -= (seated.kneeAngleDeg - 115) * 1.1;
  }
  if (seated.torsoLeanDeg > 25) {
    score -= (seated.torsoLeanDeg - 25) * 1.8;
  }
  return clamp(score, 20, 100);
}

/**
 * Score standing Off-Road Attack ergonomics (0..100).
 * @param {object} standing
 * @returns {number}
 */
function scoreStandingErgo(standing) {
  let score = 100;
  if (standing.torsoLeanDeg > 45) {
    score -= (standing.torsoLeanDeg - 45) * 2.5;
  }
  return clamp(score, 20, 100);
}

/**
 * Calculate overall Fit Score (0..100) and qualitative grade.
 * @param {object} params
 * @param {RiderProfileInput} params.rider
 * @param {object} params.sag
 * @param {object} params.footContact
 * @param {object} params.kinematics
 * @returns {{ fitScore: number, fitGrade: string }}
 */
export function calculateFitScore({ rider, sag, footContact, kinematics }) {
  const weights = resolveWeights(rider);
  const contactScore = scoreFootContact(footContact, rider);
  const seatedScore = scoreSeatedErgo(kinematics.seated);
  const standingScore = scoreStandingErgo(kinematics.standing);
  const sagScore = SAG_SCORES[sag.sagStatus] ?? 70;

  const rawScore =
    contactScore * weights.contact +
    seatedScore * weights.seated +
    standingScore * weights.standing +
    sagScore * weights.sag;

  const fitScore = Math.round(clamp(rawScore, 0, 100));

  let fitGrade = 'UNSUITABLE';
  if (fitScore >= 85) {
    fitGrade = 'EXCELLENT';
  } else if (fitScore >= 70) {
    fitGrade = 'GOOD';
  } else if (fitScore >= 52) {
    fitGrade = 'MANAGEABLE';
  } else if (fitScore >= 35) {
    fitGrade = 'CHALLENGING';
  }

  return { fitScore, fitGrade };
}

/**
 * Merge ergonomic impacts from a list of compatible accessories into BikeModificationsInput.
 * @param {BikeModificationsInput} baseMods
 * @param {CompatibleAccessoryInput[]} accessories
 * @returns {BikeModificationsInput}
 */
function mergeAccessoryMods(baseMods, accessories) {
  const merged = { ...normalizeModifications(baseMods) };
  for (const acc of accessories) {
    const impact = acc.ergoImpact ?? {};
    merged.loweringLinkMm += impact.loweringLinkMm ?? 0;
    merged.forkDropMm += impact.forkDropMm ?? 0;
    merged.lowSeatMm += impact.lowSeatMm ?? 0;
    merged.seatWidthReductionMm += impact.seatWidthReductionMm ?? 0;
    merged.barRiserMm += impact.barRiserMm ?? 0;
    merged.barBackOffsetMm += impact.barBackOffsetMm ?? 0;
    merged.pegLowerMm += impact.pegLowerMm ?? 0;
    if (typeof impact.springRateRatio === 'number') {
      merged.springRateOverrideRatio = impact.springRateRatio;
    }
  }
  return normalizeModifications(merged);
}

/**
 * Evaluate a motorcycle with base configuration (without recursive upsells).
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bike
 * @param {BikeModificationsInput} [mods]
 * @returns {object}
 */
function evaluateCore(rider, bike, mods = {}) {
  const anthropometry = computeAnthropometry(rider);
  const sag = calculateSuspensionSag(rider, bike, mods);
  const footContact = calculateFootContact(rider, bike, sag, anthropometry, mods);
  const kinematics = calculateRiderKinematics(rider, bike, sag, anthropometry, footContact, mods);
  const { fitScore, fitGrade } = calculateFitScore({ rider, sag, footContact, kinematics });

  const warnings = Array.from(
    new Set([...sag.warnings, ...kinematics.seated.warnings, ...kinematics.standing.warnings])
  );

  return {
    anthropometry,
    sag,
    footContact,
    kinematics,
    fitScore,
    fitGrade,
    warnings,
  };
}

/**
 * Build smart upsell suggestions from compatible accessories when bike fit can be improved.
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bike
 * @param {object} baseEval
 * @param {BikeModificationsInput} baseMods
 * @param {CompatibleAccessoryInput[]} compatibleAccessories
 * @returns {UpsellSuggestion[]}
 */
export function generateSmartUpsells(rider, bike, baseEval, baseMods, compatibleAccessories = []) {
  if (!Array.isArray(compatibleAccessories) || compatibleAccessories.length === 0) {
    return [];
  }

  const suggestions = [];
  const needsLowering =
    baseEval.footContact.contactStatus === CONTACT_STATUSES.TIP_TOE ||
    baseEval.footContact.contactStatus === CONTACT_STATUSES.ONE_FOOT_SHIFT ||
    baseEval.footContact.contactStatus === CONTACT_STATUSES.TOO_TALL_UNSAFE;

  if (needsLowering) {
    const loweringLinks = compatibleAccessories.filter((a) => a.category === 'LOWERING_LINK');
    const lowSeats = compatibleAccessories.filter((a) => a.category === 'LOW_SEAT');
    const candidates = [
      ...loweringLinks.map((a) => ({ type: 'SINGLE_PART', items: [a] })),
      ...lowSeats.map((a) => ({ type: 'SINGLE_PART', items: [a] })),
    ];

    if (loweringLinks[0] && lowSeats[0]) {
      candidates.push({ type: 'LOWERING_BUNDLE', items: [loweringLinks[0], lowSeats[0]] });
    }

    for (const candidate of candidates) {
      const candidateMods = mergeAccessoryMods(baseMods, candidate.items);
      const sim = evaluateCore(rider, bike, candidateMods);
      const fitScoreGain = sim.fitScore - baseEval.fitScore;
      const seatDropDelta = roundTo(
        baseEval.sag.effectiveSeatHeightMm - sim.sag.effectiveSeatHeightMm,
        1
      );

      if (
        seatDropDelta > 0 &&
        (fitScoreGain > 0 ||
          sim.footContact.oneFootContactPercent > baseEval.footContact.oneFootContactPercent)
      ) {
        const technicalNotes = [];
        if (candidateMods.loweringLinkMm >= 20) {
          technicalNotes.push(
            `Lowers chassis rear; drops ground clearance to ${sim.sag.effectiveGroundClearanceMm}mm. Recommend raising fork tubes ~${Math.min(12, Math.round(candidateMods.loweringLinkMm * 0.35))}mm in triple clamps.`
          );
        }
        const totalCost = candidate.items.reduce(
          (sum, item) => sum + (item.priceVnd ?? 0) + (item.installLaborVnd ?? 0),
          0
        );

        suggestions.push({
          type: candidate.type,
          title: candidate.items.map((i) => i.name).join(' + '),
          accessoryIds: candidate.items.map((i) => i.id),
          beforeSeatHeightMm: baseEval.sag.effectiveSeatHeightMm,
          afterSeatHeightMm: sim.sag.effectiveSeatHeightMm,
          beforeContactStatus: baseEval.footContact.contactStatus,
          afterContactStatus: sim.footContact.contactStatus,
          fitScoreGain: Math.max(0, fitScoreGain),
          estimatedTotalCostVnd: totalCost,
          technicalNotes,
        });
      }
    }
  }

  if (baseEval.kinematics.standing.recommendedBarRiserMm > 0) {
    const barRiser = compatibleAccessories.find((a) => a.category === 'BAR_RISER');
    if (barRiser) {
      const candidateMods = mergeAccessoryMods(baseMods, [barRiser]);
      const sim = evaluateCore(rider, bike, candidateMods);
      suggestions.push({
        type: 'BAR_RISER',
        title: barRiser.name,
        accessoryIds: [barRiser.id],
        beforeSeatHeightMm: baseEval.sag.effectiveSeatHeightMm,
        afterSeatHeightMm: sim.sag.effectiveSeatHeightMm,
        beforeContactStatus: baseEval.footContact.contactStatus,
        afterContactStatus: sim.footContact.contactStatus,
        fitScoreGain: Math.max(0, sim.fitScore - baseEval.fitScore),
        estimatedTotalCostVnd: (barRiser.priceVnd ?? 0) + (barRiser.installLaborVnd ?? 0),
        technicalNotes: [
          `Reduces standing Attack torso lean from ${baseEval.kinematics.standing.torsoLeanDeg}° to ${sim.kinematics.standing.torsoLeanDeg}°.`,
        ],
      });
    }
  }

  if (
    baseEval.sag.sagStatus === SAG_STATUSES.TOO_STIFF ||
    baseEval.sag.sagStatus === SAG_STATUSES.BOTTOMING_RISK
  ) {
    const spring = compatibleAccessories.find((a) => a.category === 'SHOCK_SPRING');
    if (spring) {
      const candidateMods = mergeAccessoryMods(baseMods, [spring]);
      const sim = evaluateCore(rider, bike, candidateMods);
      suggestions.push({
        type: 'SHOCK_SPRING',
        title: spring.name,
        accessoryIds: [spring.id],
        beforeSeatHeightMm: baseEval.sag.effectiveSeatHeightMm,
        afterSeatHeightMm: sim.sag.effectiveSeatHeightMm,
        beforeContactStatus: baseEval.footContact.contactStatus,
        afterContactStatus: sim.footContact.contactStatus,
        fitScoreGain: Math.max(0, sim.fitScore - baseEval.fitScore),
        estimatedTotalCostVnd: (spring.priceVnd ?? 0) + (spring.installLaborVnd ?? 0),
        technicalNotes: [
          `Adjusts rear rider sag from ${baseEval.sag.sagPercentOfTravel}% (${baseEval.sag.sagStatus}) to ${sim.sag.sagPercentOfTravel}% (${sim.sag.sagStatus}).`,
        ],
      });
    }
  }

  return suggestions.sort((a, b) => b.fitScoreGain - a.fitScoreGain);
}

/**
 * Full Rider Fit evaluation for a motorcycle, mods, and compatible accessory upsells.
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bike
 * @param {BikeModificationsInput} [mods]
 * @param {CompatibleAccessoryInput[]} [compatibleAccessories]
 * @returns {object}
 */
export function evaluateBikeFit(rider, bike, mods = {}, compatibleAccessories = []) {
  const baseEval = evaluateCore(rider, bike, mods);
  const upsellSuggestions = generateSmartUpsells(
    rider,
    bike,
    baseEval,
    mods,
    compatibleAccessories
  );

  return {
    ...baseEval,
    upsellSuggestions,
  };
}
