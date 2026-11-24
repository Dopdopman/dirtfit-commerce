import {
  buildParametricWireframe,
  compareTwoBikes,
  evaluateBikeFit,
  worldToSvg,
} from '@dirtfit/ergonomics-engine';

export const DEFAULT_RIDER_PROFILE = Object.freeze({
  heightCm: 170,
  weightKg: 68,
  inseamCm: null,
  gender: 'MALE',
  bodyProportion: 'AVERAGE',
  footwear: 'MX_BOOTS',
  ridingExperience: 'INTERMEDIATE',
  targetTerrain: 'DUAL_SPORT',
  stanceMode: 'SEATED_BOTH_FEET',
});

export const SIMULATOR_VIEWPORT = Object.freeze({
  widthPx: 860,
  heightPx: 500,
  originSvgX: 205,
  originSvgY: 440,
  pxPerMm: 0.305,
});

/**
 * Project a millimeter wireframe structure into SVG coordinates for clean React rendering.
 * @param {object} wireframe
 * @param {object} viewport
 * @returns {object}
 */
export function projectWireframeToSvg(wireframe, viewport = SIMULATOR_VIEWPORT) {
  const projectPt = (pt) => worldToSvg(pt, viewport);
  const scaleLen = (mm) => Math.round(mm * viewport.pxPerMm * 10) / 10;

  return {
    rearWheel: {
      center: projectPt(wireframe.rearWheel.center),
      tireRadiusPx: scaleLen(wireframe.rearWheel.tireRadiusMm),
      rimRadiusPx: scaleLen(wireframe.rearWheel.rimRadiusMm),
    },
    frontWheel: {
      center: projectPt(wireframe.frontWheel.center),
      tireRadiusPx: scaleLen(wireframe.frontWheel.tireRadiusMm),
      rimRadiusPx: scaleLen(wireframe.frontWheel.rimRadiusMm),
    },
    swingarm: wireframe.swingarm.map(projectPt),
    forkLine: wireframe.forkLine.map(projectPt),
    chassisLoop: wireframe.chassisLoop.map(projectPt),
    seatProfile: wireframe.seatProfile.map(projectPt),
    handlebar: wireframe.handlebar.map(projectPt),
    footpeg: projectPt(wireframe.footpeg),
    groundLine: wireframe.groundLine.map(projectPt),
  };
}

/**
 * Project the 8 anatomical rider joints into SVG space.
 * @param {object} joints
 * @param {object} viewport
 * @returns {object}
 */
export function projectJointsToSvg(joints, viewport = SIMULATOR_VIEWPORT) {
  const projected = {};
  for (const [key, pt] of Object.entries(joints)) {
    projected[key] = worldToSvg(pt, viewport);
  }
  return projected;
}

/**
 * Build complete 5-layer 2D Simulator scene synchronously (< 0.5ms for 60fps interaction).
 * @param {object} bikeGeometry
 * @param {object} riderProfile
 * @param {object} [mods]
 * @param {Array<object>} [compatibleAccessories]
 * @returns {object}
 */
export function buildSimulatorScene(
  bikeGeometry,
  riderProfile,
  mods = {},
  compatibleAccessories = []
) {
  const evaluation = evaluateBikeFit(riderProfile, bikeGeometry, mods, compatibleAccessories);
  const wireframeMm = buildParametricWireframe(bikeGeometry, evaluation.sag, mods);
  const svgWireframe = projectWireframeToSvg(wireframeMm, SIMULATOR_VIEWPORT);
  const svgJoints = projectJointsToSvg(evaluation.kinematics.activeJoints, SIMULATOR_VIEWPORT);

  const unladenSeatY = worldToSvg(
    { x: 0, y: bikeGeometry.unladenSeatHeightMm },
    SIMULATOR_VIEWPORT
  ).y;
  const effectiveSeatY = worldToSvg(
    { x: 0, y: evaluation.sag.effectiveSeatHeightMm },
    SIMULATOR_VIEWPORT
  ).y;

  const rulerTicks = [400, 600, 800, 900, 1000, 1200].map((mm) => ({
    mm,
    yPx: worldToSvg({ x: 0, y: mm }, SIMULATOR_VIEWPORT).y,
  }));

  return {
    viewport: SIMULATOR_VIEWPORT,
    evaluation,
    wireframeMm,
    svgWireframe,
    svgJoints,
    referenceLines: {
      groundY: SIMULATOR_VIEWPORT.originSvgY,
      unladenSeatY,
      effectiveSeatY,
    },
    rulerTicks,
  };
}

/**
 * Translate a millimeter wireframe by an overlay offset (for Ghost Overlay alignment).
 * @param {object} wireframe
 * @param {{ x: number, y: number }} offsetMm
 * @returns {object}
 */
function offsetWireframeMm(wireframe, offsetMm) {
  if (!offsetMm || (offsetMm.x === 0 && offsetMm.y === 0)) {
    return wireframe;
  }
  const shift = (pt) => ({ x: pt.x + offsetMm.x, y: pt.y + offsetMm.y });
  return {
    rearWheel: { ...wireframe.rearWheel, center: shift(wireframe.rearWheel.center) },
    frontWheel: { ...wireframe.frontWheel, center: shift(wireframe.frontWheel.center) },
    swingarm: wireframe.swingarm.map(shift),
    forkLine: wireframe.forkLine.map(shift),
    chassisLoop: wireframe.chassisLoop.map(shift),
    seatProfile: wireframe.seatProfile.map(shift),
    handlebar: wireframe.handlebar.map(shift),
    footpeg: shift(wireframe.footpeg),
    groundLine: wireframe.groundLine.map(shift),
  };
}

/**
 * Build Ghost Overlay comparison scene for two motorcycles around a shared rider profile.
 * @param {object} bikeAGeometry
 * @param {object} bikeBGeometry
 * @param {object} riderProfile
 * @param {object} [options]
 * @returns {object}
 */
export function buildGhostCompareScene(bikeAGeometry, bikeBGeometry, riderProfile, options = {}) {
  const comparison = compareTwoBikes(riderProfile, bikeAGeometry, bikeBGeometry, options);
  const wireframeBShifted = offsetWireframeMm(
    comparison.bikeB.wireframe,
    comparison.bikeB.overlayOffsetMm
  );

  return {
    viewport: SIMULATOR_VIEWPORT,
    comparison,
    bikeASvg: {
      wireframe: projectWireframeToSvg(comparison.bikeA.wireframe, SIMULATOR_VIEWPORT),
      joints: projectJointsToSvg(
        comparison.bikeA.evaluation.kinematics.activeJoints,
        SIMULATOR_VIEWPORT
      ),
    },
    bikeBSvg: {
      wireframe: projectWireframeToSvg(wireframeBShifted, SIMULATOR_VIEWPORT),
    },
  };
}
