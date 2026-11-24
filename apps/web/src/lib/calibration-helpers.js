import { computeCalibrationMetrics, evaluateBikeFit, worldToSvg } from '@dirtfit/ergonomics-engine';
import {
  CalibrationDataSchema,
  FOOTWEAR_TYPES,
  STANCE_MODES,
  TARGET_TERRAINS,
} from '@dirtfit/shared';

export const CALIBRATION_ANCHOR_STEPS = Object.freeze([
  {
    key: 'rearAxle',
    label: '1. Rear Axle',
    hint: 'Click the center of the rear wheel axle.',
    labelKey: 'calibration.steps.rearAxle.label',
    hintKey: 'calibration.steps.rearAxle.hint',
    color: '#E84C1E',
  },
  {
    key: 'frontAxle',
    label: '2. Front Axle',
    hint: 'Click the center of the front wheel axle.',
    labelKey: 'calibration.steps.frontAxle.label',
    hintKey: 'calibration.steps.frontAxle.hint',
    color: '#E84C1E',
  },
  {
    key: 'groundLineV',
    label: '3. Ground Line',
    hint: 'Click where the bottom of the tires touch the ground.',
    labelKey: 'calibration.steps.groundLineV.label',
    hintKey: 'calibration.steps.groundLineV.hint',
    color: '#15803D',
  },
  {
    key: 'seatPocket',
    label: '4. Seat Pocket',
    hint: 'Click the lowest rider seating dip on the saddle.',
    labelKey: 'calibration.steps.seatPocket.label',
    hintKey: 'calibration.steps.seatPocket.hint',
    color: '#0284C7',
  },
  {
    key: 'footpeg',
    label: '5. Footpeg',
    hint: 'Click the center of the rider footpeg.',
    labelKey: 'calibration.steps.footpeg.label',
    hintKey: 'calibration.steps.footpeg.hint',
    color: '#7C3AED',
  },
  {
    key: 'handlebarGrip',
    label: '6. Handlebar Grip',
    hint: 'Click the center of the handlebar grip.',
    labelKey: 'calibration.steps.handlebarGrip.label',
    hintKey: 'calibration.steps.handlebarGrip.hint',
    color: '#B45309',
  },
]);

export const DEFAULT_CALIBRATION_ANCHORS = Object.freeze({
  rearAxle: { u: 0.22, v: 0.69 },
  frontAxle: { u: 0.78, v: 0.69 },
  groundLineV: 0.87,
  seatPocket: { u: 0.39, v: 0.42 },
  footpeg: { u: 0.46, v: 0.66 },
  handlebarGrip: { u: 0.61, v: 0.31 },
});

export const PREVIEW_RIDER_170CM = Object.freeze({
  heightCm: 170,
  weightKg: 65,
  inseamCm: 79,
  footwear: FOOTWEAR_TYPES.ADV_BOOTS,
  gearWeightKg: 5,
  targetTerrain: TARGET_TERRAINS.DUAL_SPORT,
  stanceMode: STANCE_MODES.SEATED_BOTH_FEET,
});

/**
 * Clamp a number strictly between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp01(val, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(val) ? val : 0));
}

/**
 * Round a floating point value to fixed decimals.
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
function roundFixed(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Convert DOM pointer client coordinates relative to an image element bounding box into normalized [0..1] UV.
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @returns {{ u: number, v: number }}
 */
export function clientPointToUv(clientX, clientY, rect) {
  const safeWidth = Math.max(1, rect.width);
  const safeHeight = Math.max(1, rect.height);
  return {
    u: roundFixed(clamp01((clientX - rect.left) / safeWidth), 4),
    v: roundFixed(clamp01((clientY - rect.top) / safeHeight), 4),
  };
}

/**
 * Build a validated calibration payload object for API submission or local preview.
 * @param {object} params
 * @param {'RIGHT'|'LEFT'} params.facing
 * @param {number} params.imageWidthPx
 * @param {number} params.imageHeightPx
 * @param {object} params.anchorsUv
 * @returns {object}
 */
export function buildCalibrationPayload({ facing, imageWidthPx, imageHeightPx, anchorsUv }) {
  return {
    version: 1,
    facing: facing === 'LEFT' ? 'LEFT' : 'RIGHT',
    imageWidthPx: Math.max(200, Math.min(8000, Math.round(imageWidthPx || 1200))),
    imageHeightPx: Math.max(200, Math.min(8000, Math.round(imageHeightPx || 800))),
    anchorsUv: {
      rearAxle: {
        u: roundFixed(clamp01(anchorsUv.rearAxle?.u ?? DEFAULT_CALIBRATION_ANCHORS.rearAxle.u), 4),
        v: roundFixed(clamp01(anchorsUv.rearAxle?.v ?? DEFAULT_CALIBRATION_ANCHORS.rearAxle.v), 4),
      },
      frontAxle: {
        u: roundFixed(
          clamp01(anchorsUv.frontAxle?.u ?? DEFAULT_CALIBRATION_ANCHORS.frontAxle.u),
          4
        ),
        v: roundFixed(
          clamp01(anchorsUv.frontAxle?.v ?? DEFAULT_CALIBRATION_ANCHORS.frontAxle.v),
          4
        ),
      },
      groundLineV: roundFixed(
        clamp01(anchorsUv.groundLineV ?? DEFAULT_CALIBRATION_ANCHORS.groundLineV),
        4
      ),
      seatPocket: {
        u: roundFixed(
          clamp01(anchorsUv.seatPocket?.u ?? DEFAULT_CALIBRATION_ANCHORS.seatPocket.u),
          4
        ),
        v: roundFixed(
          clamp01(anchorsUv.seatPocket?.v ?? DEFAULT_CALIBRATION_ANCHORS.seatPocket.v),
          4
        ),
      },
      footpeg: {
        u: roundFixed(clamp01(anchorsUv.footpeg?.u ?? DEFAULT_CALIBRATION_ANCHORS.footpeg.u), 4),
        v: roundFixed(clamp01(anchorsUv.footpeg?.v ?? DEFAULT_CALIBRATION_ANCHORS.footpeg.v), 4),
      },
      handlebarGrip: {
        u: roundFixed(
          clamp01(anchorsUv.handlebarGrip?.u ?? DEFAULT_CALIBRATION_ANCHORS.handlebarGrip.u),
          4
        ),
        v: roundFixed(
          clamp01(anchorsUv.handlebarGrip?.v ?? DEFAULT_CALIBRATION_ANCHORS.handlebarGrip.v),
          4
        ),
      },
    },
  };
}

/**
 * Compute real-time calibration metrics, Zod validation result, and 170cm rider SVG overlay joints.
 * @param {object} calibrationPayload
 * @param {object|null|undefined} geometrySpec
 * @returns {{
 *   isValid: boolean,
 *   validationErrors: Array<string>,
 *   metrics: object|null,
 *   overlayJointsSvg: object|null,
 *   fitResult: object|null,
 *   viewBox: string
 * }}
 */
export function computeLiveCalibrationPreview(calibrationPayload, geometrySpec) {
  const parsed = CalibrationDataSchema.safeParse(calibrationPayload);
  if (!parsed.success) {
    return {
      isValid: false,
      validationErrors: parsed.error.issues.map((issue) => issue.message),
      metrics: null,
      overlayJointsSvg: null,
      fitResult: null,
      viewBox: `0 0 ${calibrationPayload.imageWidthPx || 1200} ${calibrationPayload.imageHeightPx || 800}`,
    };
  }

  const validCal = parsed.data;
  const viewBox = `0 0 ${validCal.imageWidthPx} ${validCal.imageHeightPx}`;

  if (!geometrySpec || !geometrySpec.wheelbaseMm || !geometrySpec.unladenSeatHeightMm) {
    return {
      isValid: true,
      validationErrors: [],
      metrics: null,
      overlayJointsSvg: null,
      fitResult: null,
      viewBox,
    };
  }

  const metrics = computeCalibrationMetrics(validCal, geometrySpec);
  const fitResult = evaluateBikeFit(PREVIEW_RIDER_170CM, geometrySpec, {});

  const viewport = {
    originSvgX: metrics.originPx.x,
    originSvgY: metrics.originPx.y,
    pxPerMm: metrics.pxPerMm,
  };

  const activeJoints = fitResult.kinematics?.activeJoints ?? {};
  const overlayJointsSvg = Object.fromEntries(
    Object.entries(activeJoints).map(([jointName, pt]) => [
      jointName,
      worldToSvg(
        {
          x: validCal.facing === 'LEFT' ? -pt.x : pt.x,
          y: pt.y,
        },
        viewport
      ),
    ])
  );

  return {
    isValid: true,
    validationErrors: [],
    metrics,
    overlayJointsSvg,
    fitResult,
    viewBox,
  };
}
