import { degToRad, roundTo } from './constants.js';
import { normalizeModifications } from './sag.js';

/** @typedef {import('./types.js').Point2D} Point2D */
/** @typedef {import('./types.js').BikeGeometryInput} BikeGeometryInput */
/** @typedef {import('./types.js').CalibrationData} CalibrationData */
/** @typedef {import('./types.js').SagResult} SagResult */
/** @typedef {import('./types.js').BikeModificationsInput} BikeModificationsInput */

/**
 * Derive pixel-to-millimeter scale and perspective distortion check from UV calibration data.
 * @param {CalibrationData} calibrationData
 * @param {BikeGeometryInput} bike
 * @returns {object}
 */
export function computeCalibrationMetrics(calibrationData, bike) {
  const { imageWidthPx, imageHeightPx, anchorsUv } = calibrationData;
  const rearPx = {
    x: anchorsUv.rearAxle.u * imageWidthPx,
    y: anchorsUv.rearAxle.v * imageHeightPx,
  };
  const frontPx = {
    x: anchorsUv.frontAxle.u * imageWidthPx,
    y: anchorsUv.frontAxle.v * imageHeightPx,
  };
  const groundYPx = anchorsUv.groundLineV * imageHeightPx;
  const seatPxY = anchorsUv.seatPocket.v * imageHeightPx;

  const axleSpanPx = Math.hypot(frontPx.x - rearPx.x, frontPx.y - rearPx.y);
  const pxPerMm = axleSpanPx / Math.max(1, bike.wheelbaseMm);
  const rollCorrectionDeg =
    Math.atan2(frontPx.y - rearPx.y, frontPx.x - rearPx.x) * (180 / Math.PI);

  const measuredSeatHeightMm = (groundYPx - seatPxY) / Math.max(1e-6, pxPerMm);
  const perspectiveErrorPercent =
    (Math.abs(measuredSeatHeightMm - bike.unladenSeatHeightMm) /
      Math.max(1, bike.unladenSeatHeightMm)) *
    100;

  return {
    pxPerMm: roundTo(pxPerMm, 4),
    originPx: { x: roundTo(rearPx.x, 1), y: roundTo(groundYPx, 1) },
    axleSpanPx: roundTo(axleSpanPx, 1),
    rollCorrectionDeg: roundTo(rollCorrectionDeg, 2),
    measuredSeatHeightMm: roundTo(measuredSeatHeightMm, 1),
    perspectiveErrorPercent: roundTo(perspectiveErrorPercent, 1),
    isPerspectiveDistorted: perspectiveErrorPercent > 5,
  };
}

/**
 * Project a real-world millimeter coordinate (xMm, yMm) into SVG pixel space.
 * @param {Point2D} pointMm
 * @param {object} viewport
 * @param {number} viewport.originSvgX
 * @param {number} viewport.originSvgY
 * @param {number} viewport.pxPerMm
 * @returns {Point2D}
 */
export function worldToSvg(pointMm, viewport) {
  return {
    x: roundTo(viewport.originSvgX + pointMm.x * viewport.pxPerMm, 1),
    y: roundTo(viewport.originSvgY - pointMm.y * viewport.pxPerMm, 1),
  };
}

/**
 * Convert an SVG pixel coordinate back into real-world millimeters.
 * @param {Point2D} pointSvg
 * @param {object} viewport
 * @param {number} viewport.originSvgX
 * @param {number} viewport.originSvgY
 * @param {number} viewport.pxPerMm
 * @returns {Point2D}
 */
export function svgToWorld(pointSvg, viewport) {
  const scale = Math.max(1e-6, viewport.pxPerMm);
  return {
    x: roundTo((pointSvg.x - viewport.originSvgX) / scale, 1),
    y: roundTo((viewport.originSvgY - pointSvg.y) / scale, 1),
  };
}

/**
 * Build millimeter-accurate fallback CAD wireframe primitives when a photo lacks calibrationData.
 * @param {BikeGeometryInput} bike
 * @param {SagResult} [sagResult]
 * @param {BikeModificationsInput} [mods]
 * @returns {object}
 */
export function buildParametricWireframe(bike, sagResult, mods = {}) {
  const safeMods = normalizeModifications(mods);
  const totalDropMm = sagResult ? sagResult.seatDropFromSagMm + sagResult.modSeatDropMm : 0;
  const seatY = sagResult
    ? sagResult.effectiveSeatHeightMm
    : Math.max(300, bike.unladenSeatHeightMm - totalDropMm);

  const rearAxle = { x: 0, y: bike.rearTireOuterRadiusMm };
  const frontAxle = { x: bike.wheelbaseMm, y: bike.frontTireOuterRadiusMm };

  const rearRimRadiusMm = (bike.rearWheelDiameterIn * 25.4) / 2;
  const frontRimRadiusMm = (bike.frontWheelDiameterIn * 25.4) / 2;

  const rakeRad = degToRad(bike.rakeDeg ?? 27);
  const grip = {
    x: bike.handlebarGripXMm - safeMods.barBackOffsetMm,
    y: Math.max(400, bike.handlebarGripYMm - totalDropMm * 0.4 + safeMods.barRiserMm),
  };
  const steeringHead = {
    x: roundTo(frontAxle.x - (grip.y - frontAxle.y) * Math.tan(rakeRad) * 0.45, 1),
    y: roundTo(grip.y - 60, 1),
  };

  const swingarmPivot = {
    x: roundTo(bike.footpegXMm - 40, 1),
    y: roundTo(rearAxle.y + 40, 1),
  };
  const footpeg = {
    x: bike.footpegXMm,
    y: Math.max(120, bike.footpegYMm - safeMods.pegLowerMm - totalDropMm * 0.5),
  };
  const seatPocket = {
    x: bike.seatPocketXMm,
    y: roundTo(seatY, 1),
  };

  return {
    rearWheel: {
      center: rearAxle,
      tireRadiusMm: bike.rearTireOuterRadiusMm,
      rimRadiusMm: roundTo(rearRimRadiusMm, 1),
    },
    frontWheel: {
      center: frontAxle,
      tireRadiusMm: bike.frontTireOuterRadiusMm,
      rimRadiusMm: roundTo(frontRimRadiusMm, 1),
    },
    swingarm: [rearAxle, swingarmPivot],
    forkLine: [frontAxle, steeringHead],
    chassisLoop: [
      swingarmPivot,
      steeringHead,
      { x: seatPocket.x - 160, y: seatY + 25 },
      swingarmPivot,
    ],
    seatProfile: [
      { x: seatPocket.x - 240, y: roundTo(seatY + 35, 1) },
      seatPocket,
      { x: seatPocket.x + 210, y: roundTo(seatY + 75, 1) },
    ],
    handlebar: [steeringHead, grip],
    footpeg,
    groundLine: [
      { x: -bike.rearTireOuterRadiusMm - 100, y: 0 },
      { x: bike.wheelbaseMm + bike.frontTireOuterRadiusMm + 100, y: 0 },
    ],
  };
}
