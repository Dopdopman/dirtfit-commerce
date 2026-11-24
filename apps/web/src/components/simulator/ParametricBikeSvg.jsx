'use client';

/**
 * Render millimeter-accurate 2D CAD wireframe primitives inside an SVG coordinate viewport.
 * Supports solid Carbon Ink (primary) or Blueprint Cyan (Ghost Overlay comparison).
 * @param {object} props
 * @param {object} props.svgWireframe
 * @param {'primary'|'ghost'|'dark'} [props.variant]
 * @param {number} [props.opacity]
 * @returns {import('react').JSX.Element|null}
 */
export default function ParametricBikeSvg({ svgWireframe, variant = 'primary', opacity = 1 }) {
  if (!svgWireframe) {
    return null;
  }

  const strokeColor = variant === 'ghost' ? '#0284C7' : variant === 'dark' ? '#E4E6EB' : '#1C1E21';
  const accentColor = variant === 'ghost' ? '#0284C7' : variant === 'dark' ? '#FF6B3D' : '#E84C1E';
  const tireStroke = variant === 'ghost' ? '#0284C7' : variant === 'dark' ? '#9CA3AF' : '#2E323B';

  const toPointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <g style={{ opacity }}>
      {/* Rear & Front Tires + Rims */}
      <circle
        cx={svgWireframe.rearWheel.center.x}
        cy={svgWireframe.rearWheel.center.y}
        r={svgWireframe.rearWheel.tireRadiusPx}
        fill="none"
        stroke={tireStroke}
        strokeWidth="6"
        strokeOpacity="0.85"
      />
      <circle
        cx={svgWireframe.rearWheel.center.x}
        cy={svgWireframe.rearWheel.center.y}
        r={svgWireframe.rearWheel.rimRadiusPx}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <circle
        cx={svgWireframe.rearWheel.center.x}
        cy={svgWireframe.rearWheel.center.y}
        r="3.5"
        fill={accentColor}
      />

      <circle
        cx={svgWireframe.frontWheel.center.x}
        cy={svgWireframe.frontWheel.center.y}
        r={svgWireframe.frontWheel.tireRadiusPx}
        fill="none"
        stroke={tireStroke}
        strokeWidth="6"
        strokeOpacity="0.85"
      />
      <circle
        cx={svgWireframe.frontWheel.center.x}
        cy={svgWireframe.frontWheel.center.y}
        r={svgWireframe.frontWheel.rimRadiusPx}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <circle
        cx={svgWireframe.frontWheel.center.x}
        cy={svgWireframe.frontWheel.center.y}
        r="3.5"
        fill={accentColor}
      />

      {/* Swingarm & Front Fork */}
      <polyline
        points={toPointsAttr(svgWireframe.swingarm)}
        fill="none"
        stroke={strokeColor}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <polyline
        points={toPointsAttr(svgWireframe.forkLine)}
        fill="none"
        stroke={strokeColor}
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Main Frame Triangle */}
      <polyline
        points={toPointsAttr(svgWireframe.chassisLoop)}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Seat Profile */}
      <polyline
        points={toPointsAttr(svgWireframe.seatProfile)}
        fill="none"
        stroke={accentColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Handlebar */}
      <polyline
        points={toPointsAttr(svgWireframe.handlebar)}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Footpeg Anchor */}
      <rect
        x={svgWireframe.footpeg.x - 4}
        y={svgWireframe.footpeg.y - 3}
        width="8"
        height="6"
        fill={accentColor}
      />
    </g>
  );
}
